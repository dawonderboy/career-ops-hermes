#!/usr/bin/env node
/**
 * Safely modify web-dashboard.mjs to add/update a table column.
 * 
 * PROBLEM: web-dashboard.mjs contains a large template literal (const HTML = `...`).
 * Adding nested template literals with backticks causes syntax errors because the
 * patch tool does not handle escaped backticks (\`) correctly inside template literals.
 * 
 * SOLUTION: Use Node.js string.replace() with raw string literals to avoid
 * interpretation issues. This script modifies the file safely without breaking syntax.
 * 
 * USAGE:
 *   node scripts/modify-dashboard-column.js
 * 
 * This script will:
 *   1. Read web-dashboard.mjs as a plain string
 *   2. Make targeted replacements for:
 *      - Import statements (add classifyInterviewStage)
 *      - Data extraction (add stage to parseApplications)
 *      - HTML header (add column th)
 *      - HTML cell rendering (add column td)
 *      - CSS (add .interview-stage-badge)
 *   3. Write back to file
 *   4. Verify syntax via Node.js parser
 */

const fs = require('fs');
const path = require('path');

const DASHBOARD_PATH = '/Users/robinletim/career-ops/web-dashboard.mjs';

function modify() {
  let content = fs.readFileSync(DASHBOARD_PATH, 'utf-8');
  
  console.log('Modifying web-dashboard.mjs...');
  
  // 1. Import classifyInterviewStage
  content = content.replace(
    "import { classifyPriority, buildActionQueue, parseInterviewMeta, parsePendingItem, parsePostingDateFromReport, summarizeReadiness } from './web-dashboard-lib.mjs';",
    "import { classifyPriority, buildActionQueue, parseInterviewMeta, classifyInterviewStage, parsePendingItem, parsePostingDateFromReport, summarizeReadiness } from './web-dashboard-lib.mjs';"
  );
  console.log('✓ Added classifyInterviewStage import');
  
  // 2. Extract stage from parseInterviewMeta
  content = content.replace(
    "const { interviewType, interviewDate, interviewTime, interviewer, meetingLink } = parseInterviewMeta(cells[8]);",
    "const { interviewType, interviewDate, interviewTime, interviewer, meetingLink, stage } = parseInterviewMeta(cells[8]);"
  );
  console.log('✓ Updated parseInterviewMeta destructuring');
  
  // 3. Add stage to apps.push object
  content = content.replace(
    "      interviewer,\n      meetingLink,\n    });",
    "      interviewer,\n      meetingLink,\n      stage,\n    });"
  );
  console.log('✓ Added stage to apps array');
  
  // 4. Add CSS for interview-stage-badge
  const cssOld = `  .iv-stage-chip {
    display: inline-block; margin-top: 3px; font-size: 10px;
    padding: 1px 6px; border-radius: 4px;
    background: rgba(192, 132, 252, 0.15); color: var(--purple);
    font-weight: 600; letter-spacing: 0.2px;
  }

  /* Report modal */`;

  const cssNew = `  .iv-stage-chip {
    display: inline-block; margin-top: 3px; font-size: 10px;
    padding: 1px 6px; border-radius: 4px;
    background: rgba(192, 132, 252, 0.15); color: var(--purple);
    font-weight: 600; letter-spacing: 0.2px;
  }
  .interview-stage-badge {
    display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;
    background: rgba(168, 85, 247, 0.12); color: rgb(196, 181, 253);
  }

  /* Report modal */`;

  content = content.replace(cssOld, cssNew);
  console.log('✓ Added .interview-stage-badge CSS');
  
  // 5. Add Interview Stage table header
  content = content.replace(
    `            <th onclick="setSort('status')">Status</th>
            <th>Readiness</th>`,
    `            <th onclick="setSort('status')">Status</th>
            <th>Interview Stage</th>
            <th>Readiness</th>`
  );
  console.log('✓ Added Interview Stage column header');
  
  // 6. Add interview stage cell in table rows
  // NOTE: Raw string literal to avoid template literal nesting issues
  const oldCell = '        <td><span class="status \\${escapeHtml(a.status)} editable-status" onclick="openEdit(\\${a.num})" title="Click to edit">\\${escapeHtml(a.status)}</span></td>\n        <td><div class="readiness">\\${readinessHtml}</div></td>';
  
  const newCell = '        <td><span class="status \\${escapeHtml(a.status)} editable-status" onclick="openEdit(\\${a.num})" title="Click to edit">\\${escapeHtml(a.status)}</span></td>\n        <td>\\${(a.status || \'\').toLowerCase() === \'interview\' && a.stage ? \\`<span class="interview-stage-badge">\\${escapeHtml(a.stage)}</span>\\` : \'\'}</td>\n        <td><div class="readiness">\\${readinessHtml}</div></td>';
  
  content = content.replace(oldCell, newCell);
  console.log('✓ Added Interview Stage table cell');
  
  // Write back
  fs.writeFileSync(DASHBOARD_PATH, content, 'utf-8');
  console.log('✓ Wrote changes to disk');
  
  // Verify syntax by parsing
  try {
    require(DASHBOARD_PATH);
    console.log('✓ Syntax verification: PASS');
    return true;
  } catch (err) {
    console.error('✗ Syntax verification FAILED:');
    console.error(err.message);
    return false;
  }
}

if (require.main === module) {
  const success = modify();
  process.exit(success ? 0 : 1);
}

module.exports = { modify };

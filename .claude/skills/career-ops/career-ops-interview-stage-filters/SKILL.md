---
name: career-ops-interview-stage-filters
title: Career-Ops Interview Stage UI Integration
description: Add/fix interview stage display and calendar event rendering on the web dashboard (filter buttons, table column, stage detection, chip sizing).
author: 
date: 2026-05-04
---

## Overview

The Career-Ops dashboards display interview opportunities with stage information (Recruiter Screen, Hiring Manager Interview, Zoom, Fit Call, etc.) and a calendar surface that may come from Google Calendar or tracker-derived fallback data. This skill covers:
- **Parsing** interview stage from application notes using `classifyInterviewStage()`
- **Filtering** Interview tab entries by stage
- **UI display** via stage filter buttons and an Interview Stage table column
- **Calendar source wiring** so both dashboard variants can prefer Google Calendar and fall back to tracker events
- **Calendar popover actions** that work for Google events even when they have no tracker ID
- **Safe modification** of the large ES module / HTML template without syntax corruption

See `references/dual-dashboard-calendar-overflow.md` for the cross-dashboard calendar source and overflow notes.
See `references/calendar-popover-actions.md` for Google Calendar popover action wiring and matching fallbacks.

## Problem: Stage Data Not Displayed

The web-dashboard did not show stage filter buttons or table column data, even though stage information existed in application notes.

### Root Cause

1. Filter logic was using `a.interviewType` (parenthetical detail like "with Brooke Spencer") instead of `a.stage` (actual stage name)
2. Stage field was not extracted from `parseInterviewMeta()` output
3. No UI column to display stage for Interview-status entries

## Solution: Three-Part Integration

### Part 1: Extract Stage from Interview Metadata

File: `/Users/robinletim/career-ops/web-dashboard.mjs`

Update line ~133 (in `parseApplications()` function):

```javascript
// OLD:
const { interviewType, interviewDate, interviewTime, interviewer, meetingLink } = parseInterviewMeta(cells[8]);

// NEW:
const { interviewType, interviewDate, interviewTime, interviewer, meetingLink, stage } = parseInterviewMeta(cells[8]);
```

Then add `stage` to the apps array push object (~line 150):

```javascript
apps.push({
  // ... existing fields ...
  stage,  // ADD THIS LINE
});
```

### Part 2: Fix Filter Logic

Update the Interview tab stage grouping (lines ~1810–1820):

- Change from `typeCounts`/`interviewType` to `stageCounts`/`stage`
- Add stage ranking for proper button ordering:
  ```javascript
  const stageRank = { 
    'Recruiter screen': 1, 'Intro Chat': 2, 'Phone Screen': 3, 
    'Zoom': 4, 'Interview': 5, 
    'Hiring Manager': 6, 'HM Interview': 6, 'HM interview': 6, 'HM': 6, 
    'Fit Call': 7 
  };
  ```
- Update filter condition from `interviewSubTab === '__unspecified__' ? a.interviewType : a.interviewType.toLowerCase()` to `a.stage`

### Part 3: Add Interview Stage Table Column

1. **Import** `classifyInterviewStage` at the top:
   ```javascript
   import { classifyPriority, buildActionQueue, parseInterviewMeta, classifyInterviewStage, ... }
   ```

2. **Add header** (line ~1902):
   ```html
   <th onclick="setSort('status')">Status</th>
   <th>Interview Stage</th>
   <th>Readiness</th>
   ```

3. **Add cell rendering** (between Status and Readiness cells in row template, ~line 1856):
   ```javascript
   <td>${(a.status || '').toLowerCase() === 'interview' && a.stage ? `<span class="interview-stage-badge">${escapeHtml(a.stage)}</span>` : ''}</td>
   ```

4. **Add CSS styling** (after `.iv-stage-chip`, line ~872):
   ```css
   .interview-stage-badge {
     display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;
     background: rgba(168, 85, 247, 0.12); color: rgb(196, 181, 253);
   }
   ```

## Critical: Stage Detection & Note Format

The `classifyInterviewStage()` function in `web-dashboard-lib.mjs` parses interview notes using regex. It expects **consistent patterns**:

✅ Correct formats:
- `"HM Interview: 2026-05-07 12:30 PM PT"`
- `"Recruiter Screen: 2026-05-01 10:00 AM"`
- `"Zoom: Wed 2026-05-14 2:00 PM PT"`
- `"Hiring Manager Interview: 2026-05-05 2:00pm PDT"`

❌ Common failures (stage = "Stage Unknown"):
- `"HM interview Wed 2026-05-07"` (no colon before date)
- `"before HM interview Wed"` (date missing or unparseable)
- `"Interview with Roy"` (generic, low rank)
- Mismatched capitalization or spacing

See `references/interview-stage-note-formats.md` for detailed format guide and debugging.

## Debugging: Stage Unknown Entries

If filter buttons show "Stage Unknown" for entries that should match:

1. **Verify the regex independently** in Node REPL:
   ```javascript
   const { classifyInterviewStage } = require('./web-dashboard-lib.mjs');
   console.log(classifyInterviewStage('Your note text here'));
   ```

2. **Inspect actual note text** in `data/applications.md` (check capitalization, spacing, date format)

3. **Rewrite non-matching notes** to use standard pattern (colon + date)

4. **Restart dashboard:**
   ```bash
   pgrep -f "web-dashboard.mjs" | xargs kill -9
   cd /Users/robinletim/career-ops && node web-dashboard.mjs --host 0.0.0.0 --port 3737 --path /Users/robinletim/career-ops
   ```

5. **Verify via API:**
   ```bash
   curl -s http://127.0.0.1:3737/api/state | jq '.apps[] | select(.status == "Interview") | {num, company, stage}'
   ```

## Pitfall: ES Module Template Literal Escaping

**Problem:** Modifying `web-dashboard.mjs` is error-prone because the entire HTML is a template literal (`const HTML = ...`). Adding nested template literals with backticks causes syntax errors.

**Example failure:**
```javascript
// WRONG — backtick inside backtick template literal
const HTML = `... <td>${a.stage ? `<span>${a.stage}</span>` : ''}</td> ...`;
// Error: Unexpected token '$'
```

**Solution:** Use Node.js string replacement via script (see `scripts/modify-dashboard-column.js`):
- Read file as plain string
- Use `.replace()` with escaped template literal syntax (backslash-dollar, backslash-backtick)
- Write back
- Test by running Node.js parser (no need to start the dashboard)

**Why not patch tool directly?** The patch tool does not handle nested template literals well — it interprets escaping differently than the file contains. A Node.js script is more reliable.

## Pitfall: Parenthetical Interview Stages Not Extracted

**Problem:** Interview notes formatted as `"Interview (Hiring Manager): 2026-05-07 12:30pm PDT"` were parsing as `stage: "Interview"` instead of `stage: "Hiring Manager"`. These entries showed "Stage Unknown" in the filter because the regex matched the outer keyword but didn't recognize the inner stage name.

**Root cause:** `parseInterviewMeta()` in `web-dashboard-lib.mjs` captures the matched stage in group[1] and any parenthetical text in group[2], but didn't promote parenthetical text that is itself a known stage name.

**Example:**
```
Note text: "Interview (Hiring Manager): 2026-05-07 10:00am PDT"
Regex match:
  - group[1] = "Interview"  (outer keyword)
  - group[2] = "Hiring Manager"  (parenthetical content)
Old logic: stage = "Interview" ❌ (shows as generic)
```

**Fix (applied in web-dashboard-lib.mjs lines 67–81):**

After regex matching, check if the captured parenthetical text (`match[2]`) is itself a known stage (listed in `stageRank`). If so, promote it to be the primary stage:

```javascript
const matches = Array.from(text.matchAll(stageRegex)).map(match => {
  let stage = match[1];
  let type = match[2] || null;
  // If the captured type is actually a known stage (e.g., "Hiring Manager" 
  // from "Interview (Hiring Manager)"), promote it to be the primary stage
  if (type && stageRank.hasOwnProperty(type)) {
    stage = type;
    type = null;
  }
  return { stage, type, date: match[3], rawTime: match[4] || null, rawTz: match[5] || null };
});
```

**Affected entries (now correctly showing stages):**
- #147 (Unity): `"Interview (Hiring Manager): 2026-04-30 2:00pm PDT"` → stage = "Hiring Manager" ✓
- #117 (EA): `"Interview (Zoom): 2026-05-06 11:00am GMT-07:00"` → stage = "Zoom" ✓

**Prevention:** Always check `stageRank` object for all possible stage values. When adding new stage keywords, update the regex AND the promotion logic.

## Verification

After all changes:

1. **Check API includes stage:**
   ```bash
   curl -s http://127.0.0.1:3737/api/state | jq '.apps[0:3]'
   # Should include "stage" field
   ```

2. **Check HTML has column:**
   ```bash
   curl -s http://127.0.0.1:3737/ | grep -c "Interview Stage"
   # Should return 1 or more
   ```

3. **Check rendered badges:**
   Navigate to Interview tab in browser. You should see:
   - Stage filter buttons: All Stages, Fit Call, Hiring Manager, Zoom, Recruiter Screen, etc.
   - Table column between Status and Readiness showing stages like "HM Interview", "Hiring Manager Interview", "Fit Call", blank for non-interview entries

## References

- `references/stage-extraction-formats.md` — comprehensive guide to correct/broken note formats, parenthetical promotion logic, regex breakdown, and debugging tips
- `references/interview-stage-note-formats.md` — (legacy) detailed note format guide, examples, and stage ranking
- `references/calendar-chip-overflow.md` — layout pitfall and fix pattern for calendar chips that stretch their day cells
- `references/dual-dashboard-calendar-overflow.md` — session notes for keeping Google Calendar source-of-truth + overflow fixes aligned across both dashboards
- `scripts/modify-dashboard-column.js` — template for safely adding columns via Node.js string replacement

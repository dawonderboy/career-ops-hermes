# Dashboard Interview Stage Extraction Debugging

## Problem
Dashboard shows "Stage Unknown" for interview entries even though tracker notes contain clear interview-stage keywords like "Hiring Manager Interview", "HM Interview", "Recruiter screen", etc.

## Root Causes & Fixes

### Issue 1: Missing `stage` Return in `parseInterviewMeta()`
**Symptom:** Function extracts the stage from notes but returns an object without the `stage` field.

**Fix:** Add `stage: best ? best.stage : null` to the return object in `web-dashboard-lib.mjs`.

```javascript
return {
  interviewType,
  interviewDate,
  interviewTime,
  interviewer,
  meetingLink,
  stage: best ? best.stage : null,  // ← Add this
};
```

### Issue 2: Missing `classifyInterviewStage()` Function
**Symptom:** Dashboard calls `classifyInterviewStage(stage)` to convert raw stage text ("HM interview") into emoji/label pairs, but the function doesn't exist.

**Fix:** Create the classifier in `web-dashboard-lib.mjs`:

```javascript
export function classifyInterviewStage(stageText) {
  if (!stageText) return null;
  
  const stage = String(stageText).toLowerCase().trim();
  const stageMap = {
    'recruiter screen': { emoji: '📞', label: 'Recruiter Screen', order: 1 },
    'intro chat': { emoji: '💬', label: 'Intro Chat', order: 1 },
    'phone screen': { emoji: '📱', label: 'Phone Screen', order: 1 },
    'technical screen': { emoji: '🎥', label: 'Technical Screen', order: 2 },
    'technical interview': { emoji: '💻', label: 'Technical Interview', order: 2 },
    'hiring manager interview': { emoji: '👔', label: 'Hiring Manager', order: 3 },
    'hiring manager': { emoji: '👔', label: 'Hiring Manager', order: 3 },
    'hm interview': { emoji: '👔', label: 'Hiring Manager', order: 3 },
    'hm': { emoji: '👔', label: 'Hiring Manager', order: 3 },
    'fit call': { emoji: '🤝', label: 'Fit Call', order: 4 },
    'interview': { emoji: '📝', label: 'Interview', order: 2 },
    'zoom': { emoji: '🎥', label: 'Video Interview', order: 2 },
  };
  
  const match = stageMap[stage];
  return match ? { emoji: match.emoji, label: match.label, order: match.order } : null;
}
```

### Issue 3: Regex Alternation Order Matches Wrong Pattern
**Symptom:** Notes like "Hiring Manager Interview: 2026-05-05 2:00pm PDT" are parsed as stage "Interview" instead of "Hiring Manager Interview" or "Hiring Manager".

**Root Cause:** The regex pattern alternation in `parseInterviewMeta()` checks `(Interview|...)` before longer patterns like `Hiring Manager Interview`. Regex engines try alternatives left-to-right, so the shorter match wins.

**Example:**
```javascript
// WRONG order — matches the second "Interview" in "Hiring Manager Interview"
const stagePattern = '(Interview|Recruiter screen|Hiring Manager|...)';

// CORRECT order — checks longer, more specific patterns first
const stagePattern = '(Hiring Manager Interview|Hiring Manager|Recruiter screen|Interview|...)';
```

**Fix:** Reorder the pattern to prioritize longer, more specific stage names:

```javascript
const stagePattern = '(Hiring Manager Interview|Hiring Manager|HM Interview|HM interview|HM|Recruiter screen|Phone Screen|Fit Call|Technical Screen|Technical Interview|Intro Chat|Zoom|Interview)';
```

Also update the `stageRank` object to include the new pattern:

```javascript
const stageRank = {
  'Hiring Manager Interview': 55,
  'Hiring Manager': 55,
  Interview: 60,
  'HM Interview': 55,
  // ... rest of ranks
};
```

## Tracker Note Format Guidelines

To ensure notes parse correctly:
1. **Use explicit stage prefixes** at the start of the interview details:
   - ✅ `Hiring Manager Interview: 2026-05-05 2:00pm PDT. Details...`
   - ✅ `HM Interview: Wed 2026-05-07 12:30pm PDT w/ Jerome.`
   - ✅ `Recruiter screen: 2026-05-04 10:00am PST.`
   - ❌ `Interview: 2026-05-05` (parsed as generic "Interview", not stage-specific)

2. **Avoid duplicate interview entries** in the same note:
   - Multiple "Interview:" lines confuse the parser into selecting the first match
   - Clean up stale duplicate entries before merging tracker updates

3. **Stage precedence** when multiple stages appear:
   - Parser ranks by date (newest first), then by presence of type annotation, then by stage rank
   - "Hiring Manager Interview" (rank 55) beats generic "Interview" (rank 60) due to date/type sorting, but explicit ordering in the regex ensures the longer pattern is tried first

## Testing the Fix

Quick test in Node:

```bash
node -e "
import('./web-dashboard-lib.mjs').then(m => {
  const testNotes = 'Hiring Manager Interview: 2026-05-05 2:00pm PDT. Details...';
  const result = m.parseInterviewMeta(testNotes);
  console.log('Extracted stage:', result.stage);
  const progress = m.classifyInterviewStage(result.stage);
  console.log('Classified:', progress);
});
"
```

Expected output:
```
Extracted stage: Hiring Manager Interview
Classified: { emoji: '👔', label: 'Hiring Manager', order: 3 }
```

After fix, restart the dashboard and verify via API:

```bash
curl http://127.0.0.1:3737/api/state | jq '.apps[] | select(.id == 179) | {stage, interviewProgress}'
```

Should show:
```json
{
  "stage": "HM Interview",
  "interviewProgress": {
    "emoji": "👔",
    "label": "Hiring Manager",
    "order": 3
  }
}
```

## Related

- `web-dashboard-lib.mjs` — Main location of stage extraction and classification logic
- `web-dashboard.mjs` — Calls `parseInterviewMeta()` and `classifyInterviewStage()` during `/api/state` rendering
- Career-Ops tracker schema: interview stages are extracted from tracker notes column (column 9 in `data/applications.md`)

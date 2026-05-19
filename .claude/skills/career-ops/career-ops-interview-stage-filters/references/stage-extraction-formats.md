# Interview Stage Extraction: Formats & Pitfalls

Reference for `parseInterviewMeta()` in `web-dashboard-lib.mjs` and stage detection logic.

## Stage Keywords (stageRank in order of priority)

Highest to lowest priority for selection when multiple stages found in same note:

1. **Hiring Manager Interview** (rank 55) — aliases: "Hiring Manager", "HM Interview", "HM interview", "HM"
2. **Fit Call** (rank 50) — explicit fit call
3. **Phone Screen** (rank 45) — synonym: "Telephone Screen"
4. **Technical Screen / Technical Interview** (rank 45) — coding interview, technical assessment
5. **Recruiter screen** (rank 40) — initial recruiter screen
6. **Intro Chat** (rank 40) — informal introduction call
7. **Zoom** (rank 35) — generic video interview (lowest-specificity video format)
8. **Interview** (rank 30) — generic fallback (lowest priority)

## Correct Format Patterns

All patterns require **stage keyword + colon + date in YYYY-MM-DD format**. Day of week is optional but helpful.

### Simple Direct Format
```
HM Interview: 2026-05-07 12:30pm PT
Recruiter screen: 2026-05-01 10:00 AM EDT
Fit Call: 2026-04-27 12:00PM PST
```

### With Day of Week
```
HM Interview: Wed 2026-05-07 12:30 PM PT
Phone Screen: Mon 2026-05-05 3:00pm PST
Zoom: Tue 2026-05-06 11:00am GMT-07:00
```

### With Parenthetical Details (Type/Context)
```
Interview (Hiring Manager): 2026-05-07 12:30pm PDT
Interview (Zoom): 2026-05-06 11:00am GMT
Recruiter Screen (Phone): 2026-05-01 10:00 AM
```

**Important:** When a known stage keyword appears in parentheses, the extraction logic now **promotes it as the primary stage** (see "Parenthetical Stage Promotion" below).

### With Time Zone Variants
```
HM Interview: 2026-05-07 12:30pm PT
HM Interview: 2026-05-07 12:30 PM PDT
HM Interview: 2026-05-07 12:30 PM PST
HM Interview: 2026-05-07 12:30 AM UTC
HM Interview: Wed 2026-05-07 12:30 GMT-07:00
```

## Broken Format Patterns (Will Show as "Stage Unknown")

### Missing Date
```
❌ HM interview with Brooke Spencer
❌ Before the Hiring Manager Interview
❌ Recruiter screen scheduled
```
→ **Fix:** Add explicit date. Example: `HM interview: Mon 2026-05-05 11:30am PT`

### Date Without Colon Before Stage
```
❌ HM interview Wed 2026-05-07 (no colon)
❌ Recruiter Screen Mon 2026-05-01 (no colon)
```
→ **Fix:** Add colon after stage keyword: `HM Interview: Wed 2026-05-07`

### Capitalization Mismatch
```
❌ hm interview: 2026-05-07  (lowercase 'hm')
❌ HIRING MANAGER: 2026-05-07  (all caps, should be title case)
```
→ **Fix:** The regex is case-insensitive (flag 'i'), but `stageRank` uses exact-case keys. Use consistent capitalization matching keys in `stageRank`.

### Wrong Time Format
```
❌ HM Interview: 2026-05-07 25:30pm  (invalid hour)
❌ HM Interview: 2026-05-07 12:30  (no am/pm)
```
→ The second example might work if followed by a timezone. First is a data entry error.

### Stage Name Not in Keyword List
```
❌ "Video Interview: 2026-05-07" (use "Zoom" or "Technical Interview" instead)
❌ "Initial Screening: 2026-05-07" (use "Recruiter Screen" or "Intro Chat")
❌ "Behavioral Interview: 2026-05-07" (not a recognized keyword; close to "Interview" or "Hiring Manager")
```
→ **Fix:** Rephrase using exact keywords from `stageRank`.

## Parenthetical Stage Promotion

**Special handling in `parseInterviewMeta()`:**

When the regex matches `Interview (Hiring Manager): 2026-05-07`:
- group[1] = "Interview"
- group[2] = "Hiring Manager"

The extraction logic checks: **Is group[2] a known stage in stageRank?**

- **If yes:** Promote it. `stage = "Hiring Manager"` (ignore "Interview")
- **If no:** Keep group[1]. `stage = "Interview"`

### Example Promotions
```
Input: "Interview (Hiring Manager): 2026-05-07 10:00am"
Output: stage = "Hiring Manager" ✓

Input: "Interview (Zoom): 2026-05-06 11:00am"
Output: stage = "Zoom" ✓

Input: "Interview (with Roy): 2026-05-07 10:00am"
Output: stage = "Interview" (no promotion; "with Roy" not in stageRank)
```

This allows notes to use generic "Interview" wrapper with specific stage in parentheses.

## Regex Pattern Breakdown

From `web-dashboard-lib.mjs` line 50:

```javascript
const stagePattern = '(Hiring Manager Interview|Hiring Manager|HM Interview|HM interview|HM|Recruiter screen|Phone Screen|Fit Call|Technical Screen|Technical Interview|Intro Chat|Zoom|Interview)';

const stageRegex = new RegExp(
  `${stagePattern}\\s*(?:\\(([^)]*)\\))?\\s*:?\\s*(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\s+)?(\\d{4}-\\d{2}-\\d{2})...`,
  'ig'
);
```

**Breakdown:**
- `(stagePattern)` — capture group 1: stage keyword
- `\\s*` — optional whitespace
- `(?:\\(([^)]*)\\))?` — optional non-capturing group for `(...)` with capture group 2: content inside parens
- `\\s*:?` — optional whitespace and colon
- `(?:(?:Mon|...|Sun)\\s+)?` — optional day of week + space
- `(\\d{4}-\\d{2}-\\d{2})` — capture group 3: **date (required)**
- Rest: time and timezone (optional)

**Key:** The date is mandatory. No date → no match.

## Testing & Debugging

### Manual Test in Node REPL

```javascript
const { parseInterviewMeta } = require('./web-dashboard-lib.mjs');

const note = 'Interview (Hiring Manager): 2026-05-07 10:00am PDT';
const result = parseInterviewMeta(note);
console.log(result.stage);  // Should print: "Hiring Manager"
```

### Check All Interview Entries

```bash
curl -s http://localhost:3737/api/state 2>/dev/null \
  | jq '.apps[] | select(.status == "Interview") | {num, stage}' 
```

### Grep applications.md for Suspected Bad Entries

```bash
grep "| Interview |" data/applications.md | grep -v "2026-"
# Shows lines with Interview status but no date — likely stage extraction will fail
```

## When to Update stageRank

If adding a new interview stage keyword:

1. Add to the **regex pattern** (stagePattern alternation): `|NewStageName`
2. Add to **stageRank object** with a numeric rank (see order above)
3. **Test** via `parseInterviewMeta()` to confirm extraction
4. **Update this reference** with the new keyword and its position in priority order

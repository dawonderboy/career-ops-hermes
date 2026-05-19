# Interview Stage Parsing & Dashboard Reflection

## The Problem (May 2026 Incident)

Three interview opportunities (#209 PsiQuantum, #201 Pacific Fusion, #179 GEICO) were showing **"Stage Unknown"** in the dashboard despite having interview dates and notes logged in the tracker.

Root causes:
1. **Missing stage return value** — `parseInterviewMeta()` extracted the stage but didn't return it
2. **Missing classifier function** — `classifyInterviewStage()` didn't exist; dashboard was calling undefined code
3. **Bad regex ordering** — "Interview" matched before "Hiring Manager Interview" in alternation
4. **Wrong stage rank** — Generic "Interview" (rank 60) had higher priority than specific stages like "HM Interview" (rank 55)
5. **Bad tracker note format** — Notes used "Interview:" instead of stage-specific prefixes

## The Three Layers That Must Stay in Sync

### Layer 1: Tracker Note Format (`data/applications.md`)

**Rule:** Always prefix interview notes with a **canonical stage keyword** from the list below:

- ✅ `Hiring Manager Interview: 2026-05-05 2:00pm PDT`
- ✅ `HM Interview: Wed 2026-05-07 12:30pm PDT`
- ❌ `Interview: 2026-05-05 2:00pm PDT` (generic, low priority)
- ❌ `Interviews scheduled with Roy and Jerome` (no prefix — won't parse)

**Best practice:** Place the stage keyword at the very start of notes, separated from extra details by a colon and date:

```
Hiring Manager Interview: 2026-05-05 2:00pm PDT. Details here. More context...
```

**Cleanup rule:** When editing notes, remove ALL duplicate stage entries and keep only one accurate prefix. Example:

BAD:
```
Interview: 2026-05-07 10:00am PDT. Interview: 2026-05-07 10:00am PDT. HM Interview: Wed 2026-05-07 12:30pm PDT...
```

GOOD:
```
HM Interview: Wed 2026-05-07 12:30pm PDT. Prep call Mon 2026-05-05...
```

### Layer 2: Parser Extraction (`web-dashboard-lib.mjs::parseInterviewMeta`)

**Responsibility:** Extract the stage keyword and date/time from tracker notes.

**Key implementation details:**

1. **Regex pattern must prioritize longer, specific matches over short generic ones:**
   ```javascript
   // ✅ CORRECT: longer patterns first
   'Hiring Manager Interview|Hiring Manager|HM Interview|...|Interview'
   
   // ❌ WRONG: generic patterns first
   'Interview|Recruiter screen|...|Hiring Manager'
   ```

2. **Return value MUST include the `stage` field:**
   ```javascript
   return {
     interviewType,
     interviewDate,
     interviewTime,
     interviewer,
     meetingLink,
     stage: best ? best.stage : null,  // ← MUST be here
   };
   ```

3. **Ranking should prefer specific stages over generic "Interview":**
   ```javascript
   const stageRank = {
     'Hiring Manager Interview': 55,
     'HM Interview': 55,
     'Recruiter screen': 40,
     Interview: 30,  // ← Generic fallback, LOWEST priority
   };
   ```
   When there are multiple matches in the same note with the same date, the highest-rank stage wins.

### Layer 3: Classification (`web-dashboard-lib.mjs::classifyInterviewStage`)

**Responsibility:** Map parsed stage strings to UI emoji/labels.

**Must handle all canonical stage keywords:**
```javascript
const stageMap = {
  'hiring manager interview': { emoji: '👔', label: 'Hiring Manager', order: 3 },
  'hiring manager': { emoji: '👔', label: 'Hiring Manager', order: 3 },
  'hm interview': { emoji: '👔', label: 'Hiring Manager', order: 3 },
  'hm': { emoji: '👔', label: 'Hiring Manager', order: 3 },
  'recruiter screen': { emoji: '📞', label: 'Recruiter Screen', order: 1 },
  'phone screen': { emoji: '📱', label: 'Phone Screen', order: 1 },
  'fit call': { emoji: '🤝', label: 'Fit Call', order: 4 },
  'interview': { emoji: '📝', label: 'Interview', order: 2 },
};
```

**Return format:** `{ emoji, label, order }` or `null` if unknown.

## Canonical Interview Stages

Listed in preferred order of specificity (first = most specific):

| Stage | Alias | Emoji | Order | Notes |
|-------|-------|-------|-------|-------|
| Hiring Manager Interview | HM Interview, HM interview, HM | 👔 | 3 | Most specific for hiring manager round |
| Recruiter screen | — | 📞 | 1 | Phone/video screener (recruiter-led) |
| Phone Screen | — | 📱 | 1 | Candidate phone screen |
| Technical Screen | Technical Interview | 🎥/💻 | 2 | Technical assessment |
| Fit Call | — | 🤝 | 4 | Final round (fit/offer discussion) |
| Intro Chat | — | 💬 | 1 | Early exploratory call |
| Interview | (generic) | 📝 | 2 | Fallback when stage unknown |
| Zoom | — | 🎥 | 2 | Generic video (no stage specified) |

## Testing the Pipeline (Before Committing)

**Quick manual test** of the parser:
```bash
cd /path/to/career-ops
node -e "
import('./web-dashboard-lib.mjs').then(m => {
  const testNotes = 'Your tracker note here';
  const result = m.parseInterviewMeta(testNotes);
  console.log('Extracted stage:', result.stage);
  const classified = m.classifyInterviewStage(result.stage);
  console.log('Classified:', classified);
});
"
```

**Run the full test suite:**
```bash
node --test tests/web-dashboard-lib.test.mjs
```

This suite now includes:
- 8 tests covering all canonical stages
- Regression test for "Hiring Manager Interview" vs generic "Interview" matching
- Real-world test case: duplicate notes with multiple "Interview:" entries

## Dashboard Reflection Verification

**After updating tracker notes:**

1. Verify the note at `data/applications.md`
2. Touch the file to trigger file watcher: `touch data/applications.md`
3. Wait 2–3 seconds for the dashboard to reload
4. Check the API: `curl http://127.0.0.1:3737/api/state | jq '.apps[] | select(.num == NNN) | {stage, interviewProgress}'`
5. Expected: `"stage"` = the keyword you used, `"interviewProgress"` = emoji + label

If you still see `"stage": null` or `"interviewProgress": null`:
- The regex didn't match (check case sensitivity and spacing in tracker note)
- The classifyInterviewStage map doesn't include that stage string (add it)
- The dashboard hasn't reloaded yet (restart it: `pkill -f "node.*web-dashboard"`)

## Real-World Examples

### ✅ Working Examples

**#179 GEICO** (after fix):
```
HM Interview: Wed 2026-05-07 12:30pm PDT w/ Jerome. Prep call: Mon 2026-05-05 11:30am PDT w/ Faye Spencer.
```
→ Extracts: `stage: "HM Interview"` → Classifies: `{ emoji: '👔', label: 'Hiring Manager', order: 3 }`

**#201 Pacific Fusion** (after fix):
```
Hiring Manager Interview: 2026-05-05 2:00pm PDT. Video interview with Roy Mayoral (org) + Brian Spyksma.
```
→ Extracts: `stage: "Hiring Manager Interview"` → Classifies: `{ emoji: '👔', label: 'Hiring Manager', order: 3 }`

### ❌ Broken Examples

**Generic "Interview:" prefix** (before fix):
```
Interview: 2026-05-05 2:00pm PDT. Video with Roy Mayoral.
```
→ Extracts: `stage: "Interview"` → Classifies: `{ emoji: '📝', label: 'Interview', order: 2 }`
→ **Dashboard shows generic "Interview", not "Hiring Manager"** ❌

**Duplicate entries** (before fix):
```
Interview: 2026-05-07 10:00am PDT. Interview: 2026-05-07 10:00am PDT. HM Interview: 2026-05-07 12:30pm PDT.
```
→ Parser sees three matches with same date; generic "Interview" (old rank 60) beats "HM Interview" (rank 55)
→ **Extracts wrong stage** ❌

**No stage prefix** (will never work):
```
Interview scheduled for next Tuesday 2pm with the hiring manager. Details TBD.
```
→ Regex doesn't match any canonical stage keyword
→ **Extracts: `stage: null`** ❌

## Prevention Going Forward

1. **Always use a canonical stage prefix** — never "Interview:" as a catch-all
2. **Run `node --test` before committing** — the test suite will catch new regressions
3. **Manually verify dashboard reflection** — test the three-layer pipeline after editing interview notes:
   - Update tracker
   - Check API response
   - Verify emoji appears in dashboard UI
4. **Keep the test suite updated** — if a new canonical stage is added, add it to `classifyInterviewStage()` AND to the test cases
5. **Clean up duplicate notes** — when editing an entry multiple times, consolidate to one accurate stage prefix

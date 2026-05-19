# Prevention Strategy: Interview Stage Parsing Regression

## What We Fixed

### The Symptoms
- Dashboard showed "Stage Unknown" for 3 interviews
- Tracker had correct notes with interview dates
- API reported `interviewProgress: null` for all three

### Root Cause Analysis
Five separate failures aligned:
1. **Parser didn't return stage** — `parseInterviewMeta()` extracted but didn't return it
2. **Classifier was undefined** — `classifyInterviewStage()` function didn't exist
3. **Regex ordering was wrong** — "Interview" matched before "Hiring Manager Interview"
4. **Ranking was inverted** — Generic "Interview" (60) beat specific "HM Interview" (55)
5. **Tracker notes were generic** — Used "Interview:" instead of "Hiring Manager Interview:"

## The Four-Layer Defense

### 1. **Tracker Note Format** (Layer 0: Data Input)
- ✅ Always use canonical stage prefix at note start
- ✅ Clean up duplicate entries when editing
- 🧪 Manual verification: grep tracker for stage keywords before committing

### 2. **Parser Extraction** (Layer 1: Web Dashboard Lib)
- ✅ Added `stage` field to return object
- ✅ Reordered regex: longer patterns first (avoid "Interview" matching before "Hiring Manager Interview")
- ✅ Fixed ranking: generic "Interview" = rank 30 (lowest), specific stages = 40–55
- 🧪 Unit tests: 5 new tests in `tests/web-dashboard-lib.test.mjs`

### 3. **Stage Classification** (Layer 2: Web Dashboard Lib)
- ✅ Created `classifyInterviewStage()` function
- ✅ Maps all canonical stages to emoji + label + order
- ✅ Includes "Hiring Manager Interview" as explicit key
- 🧪 Unit tests: tests all canonical stages + null case

### 4. **Dashboard Reflection** (Layer 3: Web UI)
- ✅ Dashboard calls the now-defined `classifyInterviewStage()` function
- ✅ Displays emoji + label in the stage filter
- 🧪 Manual verification: curl API `/api/state` after file changes

## Prevention Strategies

### For Code Changes
**Mandatory:** Run tests before committing any parser/classifier changes:
```bash
node --test tests/web-dashboard-lib.test.mjs
```

The test suite now includes:
- ✅ HM stage extraction (4 variants: "Hiring Manager Interview", "HM Interview", "HM interview", "HM")
- ✅ Regex ordering regression test (ensures "Hiring Manager Interview" doesn't match as generic "Interview")
- ✅ Duplicate/messy note handling (real case from #179 GEICO)
- ✅ All canonical stage classifications
- ✅ Null handling for unknown stages

### For Tracker Note Changes
**Best practice workflow:**

1. **Before editing**, check the current stage:
   ```bash
   grep "| NNN |" data/applications.md | head -c 200
   ```

2. **Use a canonical stage prefix:**
   ```
   ❌ Interview: 2026-05-05 2:00pm PDT
   ✅ Hiring Manager Interview: 2026-05-05 2:00pm PDT
   ```

3. **Test the parser** (quick 5-second check):
   ```bash
   node -e "
   import('./web-dashboard-lib.mjs').then(m => {
     const notes = 'Your new note text';
     const result = m.parseInterviewMeta(notes);
     console.log('Stage:', result.stage, '→', m.classifyInterviewStage(result.stage));
   });
   "
   ```

4. **Verify dashboard reflection:**
   ```bash
   touch data/applications.md
   sleep 3
   curl http://127.0.0.1:3737/api/state | jq '.apps[] | select(.num == NNN) | {stage, interviewProgress}'
   ```

### For Review/Audit
**Monthly check** (or when bugs appear):
```bash
# Verify all Interview status entries have a recognized stage
grep "| Interview |" data/applications.md | grep -E "(Hiring Manager|HM|Recruiter|Phone|Fit|Interview):" || echo "WARNING: Unrecognized stage format found"

# Run test suite
node --test tests/web-dashboard-lib.test.mjs

# Verify pipeline
node verify-pipeline.mjs
```

## Documentation
- **Full reference:** `references/interview-stage-parsing-pitfalls.md`
  - Three-layer sync architecture
  - Canonical stage list with emoji mapping
  - Real-world broken/working examples
  - Testing checklist

- **Skill guidance:** `SKILL.md` section "Interview stage parsing & dashboard reflection"
  - Best practices for note format
  - Canonical stage list
  - Parser testing command
  - Regression test reference

## Key Takeaways

**The core insight:** Three layers must stay in sync — tracker note format → parser extraction → UI classification. Breaking any one layer (missing function, wrong regex order, no return value, or bad data format) causes silent failures that won't show up until someone looks at the dashboard.

**Prevention:** 
1. Make parsing testable (done: unit tests)
2. Make failures loud (done: test suite must pass before commit)
3. Document the contract (done: reference guide + skill guidance)
4. Provide a verification workflow (done: manual test command + API check)

**Future safety:** Any new interview stage keywords must be added to THREE places:
1. Tracker note examples (skill + reference doc)
2. Regex pattern (web-dashboard-lib.mjs parseInterviewMeta)
3. Classification map (web-dashboard-lib.mjs classifyInterviewStage)
4. Test cases (tests/web-dashboard-lib.test.mjs)

If all three layers are updated together and tests pass, the dashboard will always reflect correctly.

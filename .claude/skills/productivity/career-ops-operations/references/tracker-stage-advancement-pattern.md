# Tracker Stage Advancement Pattern

Use this for existing tracker row updates only. Do not create a new tracker row for each stage.

When an opportunity moves through interview stages (recruiter screen → hiring manager, intro chat → HM, applied → interview), update the tracker notes to reflect completion + advancement. Use this pattern to keep the tracker a live status document.

## Pattern structure

**Old note:**
```
Recruiter screen: 2026-05-01 10:00am PDT w/ Ally Shyvers. Active.
```

**Advanced to next stage:**
```
Recruiter screen: 2026-05-01 10:00am PDT w/ Ally Shyvers ✓ (completed). Advanced to Hiring Manager Screen. HM interview: Wed 2026-05-07 12:30pm PDT w/ Jerome.
```

## Key elements

1. **Completion marker:** Add `✓ (completed)` after the recruiter screen details. Shows the stage is done.
2. **Advancement statement:** `Advanced to [Next Stage].` Makes the progression explicit.
3. **Next-stage details:** Include the new interview date/time and key contact if known.
4. **Keep prior stage intact:** Do not delete or replace the recruiter screen entry — append the advancement info so the full pipeline is visible in one note.

## Multi-stage example

```
Recruiter screen: 2026-04-29 2:00pm PDT w/ Faye Spencer (Technical Recruiter) ✓ (completed). 
Advanced to Hiring Manager Screen.
HM Interview: Wed 2026-05-07 12:30pm PDT w/ Jerome (Manager). Prep: interview-prep/.../Hiring Manager Prep - 2026-05-07.pdf.
```

## Do NOT do this

❌ Replace the old note entirely:
```
HM Interview: Wed 2026-05-07 12:30pm PDT w/ Jerome.
```
*(Lost the context that you already did a recruiter screen.)*

❌ Use vague advancement phrasing:
```
Status changed. Next interview coming.
```
*(Doesn't tell future readers what stage you completed or when.)*

❌ Duplicate the same entry twice:
```
Recruiter screen: 2026-04-29 2:00pm PDT
Recruiter screen: 2026-04-29 2:00pm PDT (completed)
```
*(Cluttered; use one entry with the marker.)*

## Real example from May 2026

**OpenAI #14 (IT Support Specialist):**

Before advancement:
```
Comp: $60.58-$67.31/hr (~$126-140K annualized) + equity. Intro Chat w/ Ally Shyvers: 2026-05-05 3:30pm PDT...
```

After completion:
```
Comp: $60.58-$67.31/hr (~$126-140K annualized) + equity. Intro Chat w/ Ally Shyvers: 2026-05-05 3:30pm PDT ✓ (completed). Advanced to Hiring Manager Screen...
```

## Tracker update method

Use `mcp_Patch` on `data/applications.md` to update the note field. Include enough surrounding context (company, role, adjacent rows) to avoid accidental replacements:

```bash
mcp_Patch(
  old_string="| 14 | 2026-05-05 | OpenAI | IT Support Specialist | ... | Intro Chat w/ Ally...",
  new_string="| 14 | 2026-05-05 | OpenAI | IT Support Specialist | ... | Intro Chat w/ Ally... ✓ (completed). Advanced to Hiring Manager Screen.",
  path="/Users/robinletim/career-ops/data/applications.md"
)
```

After patching, re-read the affected row to confirm no adjacent entries were accidentally dropped.

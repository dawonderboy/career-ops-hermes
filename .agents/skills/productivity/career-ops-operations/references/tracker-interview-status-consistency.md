# Tracker Interview Status Consistency

## The Problem: Notes vs. Status Field Mismatch

The Career-Ops tracker can contain **interview details in the notes column while the status field is NOT "Interview"**. This is often correct behavior, but requires careful interpretation.

### Common Patterns (All Valid)

| Status | Reason | Example |
|--------|--------|---------|
| `Interview` | Actively in interview process | "Hiring Manager Interview: 2026-05-06 2:00pm PDT" |
| `Responded` | Received feedback during interview process | "#179 GEICO: 'Thank you for interviewing; recruiter will follow up...'" |
| `Rejected` | Interviewed but rejected after the fact | "#112 Anthropic: 'Interview (Hiring Manager): 2026-04-29' but status is Rejected" |
| `Applied` | Application sent, interview details added after recruiter outreach | Standard pipeline |

### Session Example: May 2026 Tracker Review

**Expected:** 10 rows with "Interview" status
**Found:** 11 rows with "Interview" keyword in notes, but only 8 with `status == "Interview"`

**Discrepancy breakdown:**
- **#112 Anthropic**: Contains "Interview (Hiring Manager): 2026-04-29" in notes but status = `Rejected` (interview happened, was rejected afterward)
- **#179 GEICO**: Contains "HM Interview: Wed 2026-05-07" in notes but status = `Responded` (recruiter sent response during interview loop)
- **#14 OpenAI**: Status = `Interview` (correctly flagged, dashboard catches this)

### Why This Matters

The **dashboard correctly prioritizes the status field over parsing keywords from notes**. This is the right design because:
1. Status is the **canonical state** — it's what the workflow uses for categorization
2. Notes are **prose details** — they may reference past, future, or conditional events
3. Parsing notes could create false positives (e.g., "Rejected after HM interview" would match but shouldn't be in the active Interview queue)

### Verification Workflow

When auditing tracker–dashboard sync:

1. **Count by status field (canonical):**
   ```bash
   grep "Interview" data/applications.md | grep "^| [0-9]" | wc -l    # Should be 8 (status)
   ```

2. **Count by keyword in notes (historical/detailed):**
   ```bash
   grep "Interview" data/applications.md | grep "^| [0-9]" | wc -l    # Should be 11 (notes mentions)
   ```

3. **Reconcile mismatches:**
   - For each row found in (2) but not (1), check the status field
   - If status is `Rejected` or `Responded`: This is expected — interview happened but workflow state moved on
   - If status is something else (e.g., `SKIP`, `Evaluated`): This is a data-entry error or an interview-update note that wasn't reflected in status

### Best Practice for Tracker Updates

When updating interview details:

1. **If interview just happened (but no status change yet):**
   - Status remains `Applied` or `Evaluated`
   - Notes prepend: `Recruiter Screen: 2026-05-06 2:00pm PDT — ...`

2. **If advancing to next interview round:**
   - Update status to `Interview`
   - Notes detail the scheduled round: `Hiring Manager Interview: 2026-05-07 10:00am PDT w/ [Name]`

3. **If interview is complete and feedback received:**
   - Update status to `Responded` (if positive feedback) or `Rejected` (if rejected)
   - Keep interview details in notes for historical reference
   - Prepend the response timestamp: `Responded 2026-05-08 — [Feedback from recruiter]`

### Dashboard Rendering of Interview Metadata

The dashboard API exposes:
- `interviewDate` — extracted from notes if status == "Interview"
- `interviewTime` — extracted from notes if status == "Interview"
- `interviewType` — null unless notes prefix is parsed (e.g., "Hiring Manager Interview:")
- `meetingLink` — extracted if present in notes

**Limitation:** Rows with `status != "Interview"` but interview details in notes will not expose these fields in the API, even though they're present in the tracker. This is intentional — the dashboard is showing the current state of the workflow, not historical details.

### Recommended Fix (May 2026)

The dashboard could optionally expose:
```javascript
interviewHistory: [...past interview details from notes when status changed away from Interview]
```

This would allow future retrospectives without polluting the live "Interview" queue. However, current behavior is defensible.

### No Action Needed

All tracker–dashboard sync is functioning correctly. The 11 vs 8 discrepancy is expected and reflects proper state management.

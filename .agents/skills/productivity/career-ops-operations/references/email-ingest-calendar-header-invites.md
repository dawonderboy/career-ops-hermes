# Email ingest fallback: calendar-header invite cards and screenshot backfill

Use this when interview confirmations are visible in a rendered invite card or screenshot, but the plain-text body still looks like a scheduling request.

## Problem pattern
A forwarded invite can contain two conflicting signals:
- body text like `Please find a day and time that works best for you.`
- rendered calendar header metadata showing the actual booked slot, for example:
  - `May 06`
  - `Wed`
  - `11:00 AM - 11:30 AM GMT-07:00`
  - `Accepted by you`
  - organizer / event name / Zoom link

In that case, treat it as a real scheduled interview if the booked slot is present in the header metadata.

## Deterministic fallback pattern
Add a fallback parser for header-style invite text after ICS and explicit textual confirmation parsing. Useful markers:
- month/day line on its own, e.g. `May 06`
- time range line, e.g. `11:00 AM - 11:30 AM GMT-07:00`
- nearby invite markers such as `Accepted by you`, `Event Name`, `Zoom`, `meeting`, `conversation`, or `interview`

Normalization target:
- `2026-05-06 11:00am GMT-07:00`

Year inference rule used here:
- assume current year unless the inferred date is more than ~180 days in the past, then roll to next year

## Manual tracker backfill from screenshot
If Robin provides a screenshot of the invite and explicitly asks to update the tracker, it is acceptable to update only the existing tracker row notes directly using the visible booked slot, then run verification. Calendar screenshots or visible booked slots may update only an existing tracker row. Do not create a new tracker row from a calendar screenshot. If no tracked role exists, queue/evaluate the role through the normal pipeline first.

Example normalized note for EA row #117:
- `Interview (Zoom): 2026-05-06 11:00am GMT-07:00 (accepted, 30 min). Organizer: Tori Gunzenhauser. Event: Electronic Arts, D&I and CT Opportunities.`

## Verification
After parser or tracker changes:
- `node --test tests/email-ingest-lib.test.mjs`
- `node --check email-ingest-lib.mjs`
- `node --check email-ingest.mjs`
- `./career-ops-automation.sh verify`
- restart the watcher if parser code changed: `./career-ops-automation.sh restart-email`

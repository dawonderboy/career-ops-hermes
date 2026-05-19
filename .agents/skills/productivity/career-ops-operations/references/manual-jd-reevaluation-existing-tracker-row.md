# Manual JD re-evaluation when a tracker row already exists

Use this when Robin pastes a JD as plain text or asks for a one-off re-evaluation and the company+role may already be in `data/applications.md`.

## Why this matters

`node merge-tracker.mjs` does not always create a new tracker row from a TSV. If the company+role already exists, it can turn the pending TSV into an update of the existing row instead.

Observed pattern:
- planned as a new evaluation with next ID
- TSV written under that next ID
- `node merge-tracker.mjs` output shows:
  - `Update: #NNN Company — Role (oldscore→newscore)`
- result: existing tracker row updated, not a new row added

## Safe workflow

1. Before choosing a report number for a manual JD evaluation, search `data/applications.md` for the same company+role.
2. If an existing row is found, treat the work as a re-evaluation/update.
3. Reuse the canonical existing tracker ID for:
   - report filename
   - TSV filename
   - report link inside the TSV
4. Only use `max(existing)+1` when the role is truly net-new.
5. After `node merge-tracker.mjs`, read the output carefully:
   - `+ added` means net-new row
   - `Update: #NNN ...` means existing row was updated
6. Re-read the tracker row after merge and confirm the report link still points at the intended report.

## Pitfall

If you assume `max + 1` always becomes the new tracker ID, you can create report/link drift during re-evaluations. The tracker may stay on the old row number while your new report/TSV uses a different number.

## Verification note

If `node verify-pipeline.mjs` fails because of pre-existing legacy tracker-format rows, separate that from the current update in your final report:
- confirm the new or updated row itself is valid
- then note that unrelated tracker health debt still exists elsewhere

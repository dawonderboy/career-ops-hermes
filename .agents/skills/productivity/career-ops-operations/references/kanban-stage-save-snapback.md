# Kanban stage-save snapback

Session note: a Kanban dropdown change can appear to "snap back" if the update route only posts `{ id, current_stage }` and the server-side upsert path needs the existing stored record to preserve required fields like `company` and `role`.

Fix pattern:
1. Load the existing record by id before updating.
2. Merge the existing record into the update payload.
3. Call the shared upsert helper with the merged record.
4. On the UI side, await the save response and refresh only on `res.ok`.
5. If save fails, surface the error instead of silently refreshing.

Verification pattern:
- Use the live `/api/state` result after a stage change to confirm the persisted record changed.
- Revert temporary test changes after verification so the repo state stays clean.

This matters for both the regular dashboard and the React dashboard because they share the same Kanban data source.
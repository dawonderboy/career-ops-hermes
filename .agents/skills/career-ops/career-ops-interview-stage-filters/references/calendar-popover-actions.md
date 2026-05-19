# Calendar popover actions (Google Calendar + tracker fallback)

Session note: React dashboard calendar popover buttons stopped working after the feed switched to Google Calendar titles with `n: null`.

Observed behavior
- `Open detail` previously used `window.APPS.find(x => x.n === ev.n)`.
- Google Calendar events have no tracker id, so that lookup returned `undefined`.
- `Join meeting` and `Prep notes` were also wired as close-only no-ops.

Working pattern
- Resolve a tracker app from Google Calendar events by matching normalized `title` / `description` text back to `window.APPS`.
- If a tracker match exists, `Open detail` should open the drawer for that app.
- If no tracker match exists, `Open detail` should fall back to opening `ev.meetingLink` when present.
- `Join meeting` should prefer `ev.meetingLink`, then tracker `a.meetingLink` or `a.url`.
- `Prep notes` should resolve the latest matching prep file from `window.PREP` by normalized company/title prefix and open it via `/api/prep?file=...`.

Implementation notes
- Use normalized lowercase alphanumeric text for matching.
- Score company matches higher than role matches, but only use the result if there is a non-zero match.
- Keep exact Google titles intact in the calendar display; only the action wiring may map back to tracker data.
- For event cards with no tracker match, the buttons should still perform something useful instead of silently doing nothing.

Verification
- Clicking a Google-backed event like “Virtual Call with OpenAI” should:
  - open the drawer for the matched OpenAI app when `Open detail` is clicked
  - open the Google Calendar event URL when `Join meeting` is clicked
  - open the OpenAI prep note when `Prep notes` is clicked

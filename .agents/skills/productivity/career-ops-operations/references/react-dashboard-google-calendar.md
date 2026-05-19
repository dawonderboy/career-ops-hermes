# React dashboard Google Calendar integration notes

## Goal
Make the React dashboard calendar read from one Google Calendar only, in read-only mode, and treat that as the canonical calendar source instead of tracker-derived upcoming interviews.

## Implementation summary
- `config/profile.yml` now carries `calendar.google.calendar_id` and interview-title keywords.
- `web-dashboard.react.mjs` exposes `calendarEvents` from `/api/state`.
- `mock/calendar-view.jsx` and `mock/progress-view.jsx` read `window.__live.calendarEvents` first.
- Fallback to `window.UPCOMING` / `window.PAST_INTERVIEWS` is only for static/offline mode.

## Failure modes observed
1. `tracker-fallback` in `/api/state`
   - Means the Google Calendar query failed and the dashboard used tracker-derived events instead.
   - Check the live adapter, auth, and bridge script first.

2. Python bridge incompatibility
   - The Google Workspace bridge used Python 3.9 on this machine.
   - A `from __future__ import annotations` fix was needed because `str | None` annotations crash on older Python.
   - The bridge then failed again because `googleapiclient` was not installed.

3. Missing Google OAuth creds
   - `~/.hermes/google_token.json` was absent on this machine during the session.
   - Without OAuth credentials, the backend cannot query Calendar.

## Verification steps
- `node --check web-dashboard.react.mjs`
- Open `/api/state` and confirm `calendarSource` and `calendarEvents`
- In the browser console, inspect `window.__live.calendarSource` and `window.__live.calendarEvents.length`
- Confirm the React calendar is rendering Google-backed interview events, not `mock/data.js`

## Notes for future updates
- Prefer a single calendar ID in profile config, not hardcoded values in the dashboard.
- Keep interview filtering explicit: title/description keywords should be narrow and conservative.
- If the bridge remains flaky, consider switching the backend to a Python version that includes the Google client libraries or to a different sanctioned Google Workspace access method.

# React Dashboard Live Calendar Data Flow

Session note: the React dashboard calendar and upcoming-interviews card should read from the live `/api/state` payload, not the static mock arrays, whenever the dashboard is connected to the backend.

## Canonical flow

1. `web-dashboard.react.mjs` exposes `/api/state` built from `data/applications.md`.
2. The HTML live adapter fetches `/api/state` on boot.
3. The adapter maps `s.apps` into `window.APPS` and also derives `window.__live.interviewEvents` from apps with `interviewDate`.
4. `mock/calendar-view.jsx` and `mock/progress-view.jsx` should prefer `window.__live.interviewEvents`.
5. If `/api/state` is unavailable, fallback to `window.UPCOMING` / `window.PAST_INTERVIEWS` in `mock/data.js`.

## Verification

- Open the React dashboard and check `window.__live.enabled === true`.
- In the console, confirm `window.__live.interviewEvents.length > 0`.
- Confirm the calendar shows the same interviews as the Node dashboard for the same tracker state.

## Common pitfall

Do not trust `mock/data.js` as the authoritative calendar source when the React dashboard is live; it is only an offline fallback and can drift from the tracker.

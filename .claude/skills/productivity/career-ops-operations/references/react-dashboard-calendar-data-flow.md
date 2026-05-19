# React Dashboard Calendar Data Flow

Use this when the React dashboard calendar shows stale, missing, or unexpected interview entries.

## Source-of-truth order

1. `web-dashboard.react.mjs` / `/api/state` for live data
   - Built from `data/applications.md` by `parseApplications()`
   - Uses tracker notes for interview dates, stages, interviewer names, and meeting links
2. `mock/data.js` for the static React mock/demo layer
   - Defines `window.APPS`, `window.UPCOMING`, and `window.PAST_INTERVIEWS`
   - The calendar component reads these globals directly
3. `mock/calendar-view.jsx` for rendering only
   - Does not fetch data itself
   - Renders whatever is already in `window.UPCOMING` / `window.PAST_INTERVIEWS`

## Practical debugging steps

- If a bad future event appears only in the React mock UI, inspect `mock/data.js` first.
- If the live dashboard is wrong, inspect `data/applications.md` and the `/api/state` parser path in `web-dashboard.react.mjs`.
- After editing `mock/data.js`, refresh the React dashboard; if the entry persists, confirm whether the running build is actually using the mock layer or the live API.
- Do not assume calendar bugs are in `calendar-view.jsx`; most issues are upstream data in `mock/data.js` or tracker parsing.

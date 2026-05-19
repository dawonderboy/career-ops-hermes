# Dual-dashboard Google Calendar + overflow notes

Session pattern:
- The React dashboard and the regular dashboard both need the same calendar fix set:
  - Google Calendar as the source of truth when available
  - tracker-derived fallback when Google auth/API is unavailable
  - exact Google event titles preserved in the UI
  - no company-overlay rewriting for Google-fed entries
- The calendar chip overflow fix must be applied in both renderers:
  - `repeat(7, minmax(0, 1fr))`
  - `minWidth: 0` and `overflow: hidden` on the day cell
  - chip wrapper `width: 100%`, `maxWidth: 100%`, `boxSizing: border-box`
  - title row constrained with `display: grid` and `gridTemplateColumns: auto 1fr`
  - title span `minWidth: 0`, `whiteSpace: nowrap`, `textOverflow: ellipsis`
- Verification that matters:
  - `/api/state` should expose `calendarSource: "google-calendar"` and `calendarEvents`
  - browser DOM inspection should confirm the day cell width stays bounded after rerenders

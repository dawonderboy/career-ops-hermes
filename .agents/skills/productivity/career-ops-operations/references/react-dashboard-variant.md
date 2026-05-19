# React Dashboard Variant

## Overview

Career-Ops has **two dashboard implementations**:

1. **Original Node.js Dashboard** (`web-dashboard.mjs`, port 3737)
   - Monolithic inline HTML/JS
   - Parses live `data/applications.md` on every request
   - Real-time file watching
   - Primary/production version
   - Started via launchd service `com.robinletim.career-ops.web-dashboard`

2. **React Dashboard Variant** (`web-dashboard.react.mjs`, port 3940 by default)
   - React-based UI (modular components)
   - Same backend APIs as Node.js version (`/api/state`, `/api/stream`, `/api/pipeline`, `/api/update`)
   - Serves React mock at `Career Ops Dashboard.html`
   - Components in `./mock/` folder (JSX files)
   - Static fallback data in `mock/data.js`
   - **Status (May 2026):** Running but may need troubleshooting

## Port Mapping

| Port | Service | Status | Notes |
|------|---------|--------|-------|
| 3737 | Node.js Dashboard | Running (launchd) | Primary, production |
| 3940 | React Dashboard | Running (manual?) | Variant, test/comparison |
| 8088 | Hermes Dashboard | Running (launchd) | Separate project |

## React Dashboard Components

Located in `./mock/`:
- `Career Ops Dashboard.html` — Main HTML entry point
- `ui-shell.jsx` — Layout/shell
- `pipeline-view.jsx` — Pipeline/inbox section
- `progress-view.jsx` — Application progress tracking
- `calendar-view.jsx` — Interview calendar (2-week grid)
- `scan-queue.jsx` — Scan results queue
- `drawer.jsx` — Side drawer/navigation
- `tweaks-panel.jsx` — Settings/customization
- `data.js` — Static mock data for testing

## How React Dashboard Gets Data

The React variant has **two data sources**:

1. **Live API** (preferred): same `/api/state` endpoint as Node.js dashboard
   - Reads from `data/applications.md` on the fly
   - Real-time updates via `/api/stream` SSE
   - Same parsing logic (`web-dashboard-lib.mjs`)

2. **Static mock data** (fallback): `mock/data.js`
   - Used for testing/offline work
   - Contains hardcoded app entries, interviews, pipeline items
   - Does NOT update when tracker changes
   - Useful for UI development but not production data

## Known Issues (May 2026)

### React Dashboard Not Responding to API Requests

Symptom: `curl http://localhost:3940/api/state` returns "Empty reply from server" or HTTP error.

Cause: The Node.js HTTP server may be misconfigured or crashing silently.

Recovery:
1. Check process status: `ps aux | grep web-dashboard.react`
2. Check listening ports: `lsof -i :3940`
3. Check for errors in startup logs (if running via launchd, check `/Users/robinletim/Library/Logs/career-ops/`)
4. Restart manually:
   ```bash
   pkill -f "web-dashboard.react"
   cd /Users/robinletim/career-ops
   node web-dashboard.react.mjs --port 3940 --host 0.0.0.0 --path . &
   ```
5. Verify: `curl http://localhost:3940/ | head -20`

### Calendar Date Parsing

Both dashboards use `parseInterviewMeta()` from `web-dashboard-lib.mjs` to extract interview dates from tracker notes.

The regex expects formats like:
- `Hiring Manager Interview: 2026-05-07 12:30pm PDT`
- `Wed 2026-05-07 12:30pm PDT`
- `Interview (Hiring Manager): 2026-05-07`

If dates don't parse, check:
1. Tracker notes follow one of the above patterns
2. Date is in YYYY-MM-DD format
3. Stage keyword (HM, Hiring Manager, Recruiter screen, etc.) is recognized

See `interview-stage-parsing-pitfalls.md` for detailed stage/date regex patterns.

## Migration Path

If transitioning from Node.js to React dashboard:
1. Keep both running during testing (ports 3737 and 3940)
2. Verify React dashboard can read live API data from Node.js
3. Test calendar, interview extraction, pipeline views side-by-side
4. Once confident, update launchd plist to run React version on primary port (3737)
5. Retire old Node.js HTML/JS inline code or keep as backup

## References

- Main implementation: `web-dashboard.react.mjs`
- Shared API logic: `web-dashboard-lib.mjs`
- Original Node.js dashboard: `web-dashboard.mjs` (for comparison)
- React component library: See individual `.jsx` files in `./mock/`
- Interview date parsing: See `references/interview-stage-parsing-pitfalls.md`

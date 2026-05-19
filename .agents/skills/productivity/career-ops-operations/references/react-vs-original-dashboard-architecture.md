# React vs. Original Dashboard Architecture

When working on the career-ops dashboards, understand which one to modify for your change.

## Quick Decision Tree

```
Are you adding/modifying...

API endpoints or server-side logic?
  → Patch BOTH dashboards (they share backend)

HTML UI, buttons, styling, layout?
  → Original: patch web-dashboard.mjs directly
  → React: patch mock/Career Ops Dashboard.html (HTML entry point) 
           OR mock/*.jsx (component code)

Client-side event handlers, data fetching?
  → Original: inline <script> in web-dashboard.mjs
  → React: also inline in Career Ops Dashboard.html 
           (window.__live functions, SSE listeners, etc.)

Component behavior, state management, forms?
  → React: use mock/*.jsx components with React hooks
  → Original: not applicable (pure HTML + vanilla JS)
```

## Architecture Overview

### Original Dashboard (`web-dashboard.mjs`, port 3737)

- **Single file:** All HTML, CSS, JS inline in Node.js script
- **Server:** Express-like HTTP handler (request/response routing)
- **Frontend:** Vanilla JavaScript, no framework
- **Styling:** Inline CSS in template literals
- **Features:** Real-time SSE, status updates, modal forms, inline editing

**When to modify:**
- Changing table layout, section order, styling
- Adding new dashboard sections or cards
- Modifying form handling
- Anything that doesn't require React component reuse

### React Dashboard (`web-dashboard.react.mjs`, port 3940)

- **Server:** Serves `mock/Career Ops Dashboard.html` as entry point + exposes same `/api/*` endpoints
- **Frontend:** React components in `mock/*.jsx`, compiled in-browser via Babel
- **Component Structure:**
  - `ui-shell.jsx` — Main wrapper, tab navigation, theme
  - `pipeline-view.jsx` — Pipeline inbox UI
  - `progress-view.jsx` — Application progress and status
  - `calendar-view.jsx` — Interview calendar with Google Calendar integration
  - `scan-queue.jsx` — Scan queue panel with buttons
  - `drawer.jsx` — Sidebar navigation
  - `tweaks-panel.jsx` — Settings and theme tweaks
  - `data.js` — Static fallback data (used if `/api/state` unreachable)
- **Client-side setup:** `Career Ops Dashboard.html` defines `window.__live` functions, SSE listeners, and Babel transpilation

**When to modify:**
- Adding new interactive components
- Changing component state management
- Reusable UI patterns (buttons, modals, lists)
- Anything that benefits from React's data binding and hooks

## Shared Backend

Both dashboards:
- Consume the same `/api/state` endpoint
- Trigger actions via same `/api/scan`, `/api/pipeline`, `/api/update` endpoints
- Subscribe to SSE `/api/stream` for real-time updates
- Use identical data parsing (`web-dashboard-lib.mjs`)

**Modification rule:** If you change the API response shape or add a new endpoint, **update both dashboards' client code** to consume it correctly.

## File Locations

```
web-dashboard.mjs              Original dashboard (all-in-one)
web-dashboard.react.mjs        React dashboard server (serves HTML + API)
mock/
  ├── Career Ops Dashboard.html HTML entry point (React + SSE setup)
  ├── ui-shell.jsx             Main component wrapper
  ├── pipeline-view.jsx        Pipeline section
  ├── progress-view.jsx        Progress section
  ├── calendar-view.jsx        Calendar section
  ├── scan-queue.jsx           Scan queue panel
  ├── drawer.jsx               Sidebar
  ├── tweaks-panel.jsx         Settings
  └── data.js                  Static fallback
```

## Real Pattern from May 2026

**Added scan button:**
- Modified `web-dashboard.mjs` (original): added scanState, startScan(), /api/scan endpoint, window.__live.runScan()
- Modified `web-dashboard.react.mjs` (React): added scanState, startScan(), /api/scan endpoint
- Modified `mock/Career Ops Dashboard.html` (React HTML): added window.__live.runScan()
- Modified `mock/scan-queue.jsx` (React component): added scan button JSX

Endpoints and state are kept in sync; UI and styling diverge by design.

## Testing Both Dashboards

```bash
# Terminal 1: Original
launchctl kickstart -k "gui/$(id -u)/com.robinletim.career-ops.web-dashboard"
curl http://127.0.0.1:3737/api/state | jq .

# Terminal 2: React  
node web-dashboard.react.mjs --port 3940
curl -k https://127.0.0.1:3940/api/state | jq .

# Browser
http://127.0.0.1:3737  (original)
https://127.0.0.1:3940 (React — self-signed cert OK)
```

Both should show identical tracker data, interview events, and pipeline items. UI differs, but data is consistent.

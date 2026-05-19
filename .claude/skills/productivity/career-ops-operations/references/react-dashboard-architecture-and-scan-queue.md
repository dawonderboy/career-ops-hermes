# React Dashboard Architecture & Scan Queue (port 3940)

## Files

| File | Role |
|------|------|
| `mock/Career Ops Dashboard.html` | Entry point. Loads React 18 + Babel standalone, then all JSX files as `<script type="text/babel">`. Contains the live adapter and the `App` component inline. |
| `mock/data.js` | Static fallback — sets `window.APPS`, `window.FUNNEL`, `window.SCAN_QUEUE`, etc. Loaded before JSX. The live adapter overwrites these on boot. |
| `mock/ui-shell.jsx` | Shared primitives: `THEMES`, `ScoreChip`, `StatusPill`, `Tab`, `TopBar`, `Stats`, `Sparkline`. Exposed as `window.*`. |
| `mock/scan-queue.jsx` | Scan queue panel (360px sidebar). Reads `window.SCAN_QUEUE`. Collapses to compact row when idle. |
| `mock/pipeline-view.jsx` | Applications table with sort/filter. Legacy simple view (less-used). |
| `mock/kanban-view.jsx` | Kanban board. Cards highlight overdue follow-ups with yellow border. |
| `mock/calendar-view.jsx` | Interview calendar. |
| `mock/progress-view.jsx` | Funnel/metrics charts. |
| `mock/drawer.jsx` | Slide-in app detail drawer. |
| `mock/tweaks-panel.jsx` | Settings panel (theme, density, toggles). |
| `web-dashboard.react.mjs` | Node server on port 3940. Serves the HTML + JSX as static files, exposes `/api/state`, `/api/stream` SSE, `/api/pipeline`, `/api/scan`, `/api/queue/remove`, `/api/pipeline-status`. |

## Data Flow

```
pipeline.md (- [ ] unchecked lines)
    ↓ parsePendingInbox() + parsePendingItem()
/api/state → { inboxItems: [...] }
    ↓ applyState() in liveAdapter (inline script in HTML)
window.SCAN_QUEUE = inboxItems.map(...)   ← all set to state:"queued"
    ↓ dispatchEvent("career-ops:live-update")
ScanQueue component re-reads window.SCAN_QUEUE
```

## Key Invariants

- **`window.SCAN_QUEUE` source of truth** = unchecked `- [ ]` lines in `data/pipeline.md`. One unchecked line = one queue entry.
- **`data.js` is a static fallback only**. It must never contain real company names or mock queue entries — they flash on screen before live data loads and can get stuck if the live fetch fails.
- **Statuses for pipeline.md lines**: `- [ ]` = pending (shown in queue), `- [x]` = done, `- [!]` = skip/special. Only `- [ ]` lines feed the scan queue.
- **`window.KANBAN`** comes from `data/kanban-pipeline.json` via `/api/state`, not from data.js.
- **SSE stream** (`/api/stream`) sends `event: update` on file changes; the adapter refetches `/api/state` and re-calls `applyState()`.
- **`STATUS_OPTIONS` / `STATUSES`** must be kept in sync across two locations: `STATUS_OPTIONS` in the inline `<script type="text/babel">` block in the HTML (used by `PipelineViewTweaked`), AND `STATUSES` in `pipeline-view.jsx` (used by the legacy `PipelineView`). Both must be updated together when adding a new status filter.

## Pipeline Status State — Two-Level Design

### In-session state (server memory only)
`pipelineState` and `scanState` objects in `web-dashboard.react.mjs` track running/startedAt/finishedAt/exitCode. Reset to null on server restart.

### Boot seeding from logs
`seedStateFromLogs()` IIFE runs at module load, before any request is served. Reads `logs/pipeline-trigger.log` and `logs/scan-trigger.log`, finds the last `[ISO-timestamp] exit=N` line, and seeds `finishedAt`/`exitCode` so `/api/pipeline-status` returns real data immediately after restart.

Log format written by the server:
```
[2026-05-14T05:20:43.303Z] /api/pipeline triggered
...output...
[2026-05-14T05:21:11.391Z] exit=0
```

The parser extracts the ISO timestamp from the last `exit=` line as `finishedAt`, and the nearest preceding `[timestamp]` line as `startedAt`.

### Frontend display
`PipelineStatusCard` in the HTML polls `/api/pipeline-status` every 5s and on `career-ops:live-update`. It prefers `status.finishedAt` over `status.startedAt` for the "last:" label (completion time is more meaningful than start time). Falls back to `"not recorded"` when both are null — never `"never"`.

## Filter Tabs — STATUS_OPTIONS Canonical List (May 2026)

```js
["all", "Interview", "Applied", "Responded", "Evaluated", "Rejected", "Discarded", "SKIP"]
```

- Labels rendered lowercase via `s.toLowerCase()` — displayed as `skip`, `evaluated`, etc.
- Counts computed via `apps.filter(a => a.status === s).length` — exact case match. Data uses `"SKIP"` (uppercase) so the option must be uppercase in the array.
- `all` count always includes SKIP entries — it's `apps.length` with no filter.
- Both `STATUS_OPTIONS` (HTML) and `STATUSES` (pipeline-view.jsx) must stay in sync.

## Kanban Card Overdue Highlighting

Overdue follow-up is computed server-side in `web-dashboard-lib.mjs → normalizeKanban()` at line ~717:
```js
is_followup_overdue: isFollowupOverdue   // true if follow_up_due_date < today
```

The same field drives:
1. `m.overdue_followups_count` in `kanban.metrics` → displayed in the header badge
2. `record.is_followup_overdue` in each card → drives visual highlight

**Highlight implementation (kanban-view.jsx `KanbanCard`):**
```js
const borderColor = urgent ? `${t.red}88` : overdue ? `${t.yellow}88` : t.surface;
const cardBg = overdue && !urgent ? `${t.yellow}08` : undefined;
// boxShadow: overdue && !urgent → `0 0 0 1px ${t.yellow}20`
```

Priority: urgent (red) > overdue (yellow) > normal. Because both use the same source field, header count and card highlight are always in sync — zero false positives / missed cards.

## Scan Queue Idle Collapse (May 2026)

When `deriveScanQueueState(rawQueue).displayState === "idle"`:
- **Early return** in `ScanQueue` renders a compact single-row layout
- Row contains: "SCAN QUEUE" label | "idle" text | "🔍 Run scan" button
- Full 360px panel with filter chips, both action buttons, item list only shown when `displayState !== "idle"`
- The idle body text ("No scans in queue…") inside the list `<div>` was removed — the early return handles that path entirely

**When queue becomes active**: the `career-ops:live-update` listener in `useEffect` re-reads `window.SCAN_QUEUE`, `deriveScanQueueState` returns a non-idle displayState, and React renders the full panel.

## Scan Queue Bug Pattern (May 2026 — original fix)

**Symptom**: Queue showed "Lucid Motors" with nothing real pending.

**Root causes**:
1. `mock/data.js` had 12 hardcoded fake entries in `window.SCAN_QUEUE`. These rendered before live data loaded and persisted if the live fetch had any delay.
2. `scan-queue.jsx` read `window.SCAN_QUEUE` at render time with no React state and no subscription to `career-ops:live-update`. Parent re-renders were the only thing that could refresh it.
3. One real unchecked `- [ ]` line remained in `pipeline.md` (Lucid Motors "Vehicle Software Support Engineer" — an out-of-scope role).

**Fix applied**:
- `mock/data.js`: `window.SCAN_QUEUE = []` — empty static fallback.
- `mock/scan-queue.jsx`: Added `useState` + `useEffect` subscribing to `career-ops:live-update`. Added `normalizeScanQueue()` guard, `deriveScanQueueState()` helper.
- `data/pipeline.md`: Marked the stale Lucid Motors entry `[x] SKIP`.

## Adding Real Queue Items

To add URLs to the scan queue, update `data/pipeline.md` only after checking for an existing matching URL/company/role in both `data/pipeline.md` and `data/applications.md`.

Add one pending line under the correct pending section, then run `node verify-pipeline.mjs`.

Do not add duplicates just to make the UI queue change. The SSE watcher picks up the file change and re-fetches state automatically within ~250ms.

## Clearing a Stuck Queue Entry

Change `- [ ]` to `- [x]` (evaluated/done) or `- [x] SKIP | ...` in `pipeline.md`. The dashboard clears within seconds via SSE + re-fetch. No server restart needed.

## Restarting the React Dashboard

The React dashboard is managed by launchd:
```
launchctl kickstart -k gui/$(id -u)/com.robinletim.career-ops.web-dashboard-react
```
Do NOT manually run `node web-dashboard.react.mjs &` — port 3940 will EADDRINUSE because launchd already owns it. Let launchd restart it via kickstart.

After restart, verify the new process is running:
```
ps aux | grep "web-dashboard.react" | grep -v grep
```

## Validation After Dashboard Changes

```bash
node verify-pipeline.mjs          # pipeline health — 0 errors expected
node test-all.mjs                 # 75 pass / 8 fail pre-existing (Go not in PATH, abs paths in scripts)
```

Known pre-existing test-all failures (not introduced by dashboard changes):
- "Dashboard build failed" — `go` not in PATH when run via hermes/execute_code
- Absolute paths in `ingest-email.sh`, `install-career-ops-finder-mounts.sh`, skill reference files
- Personal data warnings in `README.cn.md`, `README.zh-TW.md` (santifer.io references)

No `npm run lint` / `npm run build` — project is vanilla JS (Babel standalone), not a bundled app.

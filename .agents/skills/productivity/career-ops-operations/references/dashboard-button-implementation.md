# Dashboard Button Implementation (Scan & Pipeline Triggers)

Canonical current reference: this file documents the current dashboard action-button wrapper pattern after the May 2026 fix, assuming the wrapper scripts are present in the repo. Cross-check `references/web-dashboard-pipeline-trigger-bug.md` only for historical failure context.

Use this when adding a new action button to the dashboards (e.g., "Run Scan", "Run Pipeline", or custom workflow triggers).

**Pattern:** Wrapper script + API endpoint + client-side wiring.

## Step 1: Create Wrapper Script

File: `{action}-run.mjs`

```javascript
#!/usr/bin/env node
/**
 * {action}-run.mjs — Wrapper to invoke `/career-ops {action}` via Claude Code CLI.
 *
 * Called by dashboards when the "{action}" button is clicked.
 * Uses Claude Code CLI to execute the /career-ops {action} skill.
 *
 * Exit code reflects {action} success/failure.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Invoke Claude Code CLI with the /career-ops {action} skill
const proc = spawn('claude', [
  '-p',
  'Run /career-ops {action}',
  '--permission-mode', 'bypassPermissions',
  '--output-format', 'text'
], {
  cwd: process.cwd() || __dirname,
  stdio: 'inherit',
});

proc.on('exit', code => {
  process.exit(code || 0);
});

proc.on('error', err => {
  console.error(`Failed to spawn claude: ${err.message}`);
  process.exit(1);
});
```

## Step 2: Add State + Function to Both Dashboards

**Original (`web-dashboard.mjs`):**

Add state near top (after `pipelineState`):
```javascript
const {ACTION}_LOG = join(ROOT, 'logs', '{action}-trigger.log');
const {action}State = {
  running: false, startedAt: null, finishedAt: null,
  exitCode: null, lastError: null,
};
```

Add function (copy `startPipeline()` pattern):
```javascript
function start{Action}() {
  if ({action}State.running) return { ok: false, error: 'already-running' };
  // ... initialize state, spawn('./action-run.mjs'), handle output/exit
  return { ok: true, startedAt: {action}State.startedAt };
}
```

Add endpoint (after `/api/pipeline`):
```javascript
if (url.pathname === '/api/{action}' && req.method === 'POST') {
  const result = start{Action}();
  if (!result.ok) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: result.error, startedAt: {action}State.startedAt }));
    return;
  }
  res.writeHead(202, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
  return;
}
```

**React (`web-dashboard.react.mjs`):** Apply identical changes.

## Step 3: Wire Client-Side Functions

**HTML Dashboard** (`mock/Career Ops Dashboard.html`):

```javascript
window.__live.run{Action} = async function () {
  const r = await fetch("/api/{action}", { method: "POST" });
  return r.json().catch(() => ({}));
};
```

## Step 4: Add Button to UI

**JSX Component** (e.g., `mock/scan-queue.jsx`):

```jsx
<button onClick={() => window.__live?.run{Action}()} style={{
  background: `${t.color}1a`, color: t.color,
  border: `1px solid ${t.color}66`, borderRadius: 5,
  padding: "6px 10px", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600,
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
}}>
  🎯 Run {Action} now
</button>
```

## Pitfalls & Notes

- **Do NOT use Claude Code CLI `-p` prompt mode to invoke skill commands.** The pattern `spawn(CLAUDE_BIN, ['-p', '/career-ops action', ...])` fails silently or returns "Unknown command: /career-ops". Slash-commands are not recognized in prompt mode. Always use a wrapper script.
- **Wrapper script must use `stdio: 'inherit'`** or capture/log stdout/stderr explicitly so the caller sees actual progress and errors.
- **State broadcast is critical**: Call `broadcast('{action}')` after state changes so SSE subscribers (dashboard UI) re-fetch `/api/state` and update buttons/status in real time.
- **Restart both dashboards after wiring changes** — old Node processes won't pick up new endpoints until `launchctl kickstart` or manual restart.
- **React dashboard inherits endpoints from HTML file** — the JSX components call `window.__live?.run{Action}()` which is defined in `Career Ops Dashboard.html`. No separate wiring needed in React code itself.

## Real Example from May 2026

Added `scan-run.mjs` + `/api/scan` endpoint + `window.__live.runScan()` + scan button. Both dashboards now have one-click scan triggering from the scan queue panel.

### Files Created
- `scan-run.mjs` and `pipeline-run.mjs` — wrappers for both actions

### Files Modified
- `web-dashboard.mjs` — added scanState, startScan(), /api/scan endpoint
- `web-dashboard.react.mjs` — added scanState, startScan(), /api/scan endpoint
- `mock/Career Ops Dashboard.html` — added window.__live.runScan()
- `mock/scan-queue.jsx` — added scan button UI

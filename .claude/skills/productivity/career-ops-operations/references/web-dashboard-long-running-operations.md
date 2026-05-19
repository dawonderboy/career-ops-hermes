# Web Dashboard Long-Running Operations (Pipeline, Scan)

## Pattern Overview

The Career-Ops dashboards (both original `web-dashboard.mjs` and React `web-dashboard.react.mjs`) support triggering long-running operations via HTTP endpoints. The pattern is:

1. **Wrapper script** (`pipeline-run.mjs`, `scan-run.mjs`) — simple Node script that invokes the Claude Code CLI skill
2. **Endpoint handler** — catches `/api/{operation}` POST requests, spawns the wrapper, tracks state
3. **Client button** — calls `window.__live.runOperation()` which POSTs to the endpoint
4. **State broadcast** — SSE sends updates to all connected clients as operation runs

## Critical Pitfall: Claude Code CLI Slash-Command Syntax

**Problem:** The original broken code tried to invoke slash-commands as prompt strings:
```javascript
spawn(CLAUDE_BIN, ['-p', '/career-ops pipeline', '--permission-mode', 'bypassPermissions', ...])
```

This fails silently with `Unknown command: /career-ops` because Claude Code CLI's `-p` flag expects natural language, not slash-command syntax.

**Solution:** Use a wrapper script that properly invokes the skill. The wrapper itself uses the correct syntax:
```javascript
spawn('claude', [
  '-p', 'Run /career-ops scan',  // Natural language triggers the slash-command
  '--permission-mode', 'bypassPermissions',
  '--output-format', 'text'
], { cwd: process.cwd(), stdio: 'inherit' })
```

The key: the `-p` argument is a **prompt string that contains the slash-command**, not the slash-command itself.

## Implementation Checklist

### 1. Create Wrapper Script
File: `/Users/robinletim/career-ops/{operation}-run.mjs`

```javascript
#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// CORRECT: prompt string contains the slash-command
const proc = spawn('claude', [
  '-p',
  'Run /career-ops {operation}',  // e.g. 'Run /career-ops scan'
  '--permission-mode', 'bypassPermissions',
  '--output-format', 'text'
], {
  cwd: process.cwd() || __dirname,
  stdio: 'inherit',
});

proc.on('exit', code => process.exit(code || 0));
proc.on('error', err => {
  console.error(`Failed to spawn claude: ${err.message}`);
  process.exit(1);
});
```

### 2. Add State and Log Path (both dashboards)

In `web-dashboard.mjs` and `web-dashboard.react.mjs`, add near the top with other state:

```javascript
const {OPERATION}_LOG = join(ROOT, 'logs', '{operation}-trigger.log');
const {operation}State = {
  running: false, startedAt: null, finishedAt: null,
  exitCode: null, lastError: null,
};
```

### 3. Add startOperation() Function

Copy the `startPipeline()` function as a template:
- Change state references from `pipelineState` to `{operation}State`
- Change log path from `PIPELINE_LOG` to `{OPERATION}_LOG`
- Change log message from `/api/pipeline triggered` to `/api/{operation} triggered`
- Change the spawn path to `./​{operation}-run.mjs`

### 4. Add /api/{operation} Endpoint

In both dashboards' request handlers (around line 3369 in original, 652 in React):

```javascript
if (url.pathname === '/api/{operation}' && req.method === 'POST') {
  const result = start{Operation}();
  if (!result.ok) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: result.error, startedAt: {operation}State.startedAt }));
    return;
  }
  res.writeHead(202, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
  return;
}
```

### 5. Wire Client Function (HTML file only)

In `mock/Career Ops Dashboard.html`, add the function near `runPipeline`:

```javascript
window.__live.run{Operation} = async function () {
  const r = await fetch("/api/{operation}", { method: "POST" });
  return r.json().catch(() => ({}));
};
```

The React dashboard automatically picks this up since it serves the same HTML file.

### 6. Add UI Button (React scan-queue.jsx)

```jsx
<button onClick={() => window.__live?.run{Operation}()} style={{
  background: `${t.green}1a`, color: t.green,
  border: `1px solid ${t.green}66`, borderRadius: 5,
  padding: "6px 10px", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600,
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
}}>
  🔍 Run {operation} now
</button>
```

## Testing

After changes, verify at three layers:

1. **Endpoint health:**
   ```bash
   curl -s http://127.0.0.1:3737/api/{operation} -X POST | jq '.'
   # Should return: { "ok": true, "startedAt": "2026-..." }
   ```

2. **Log file:**
   ```bash
   tail -20 logs/{operation}-trigger.log
   # Should show: [timestamp] /api/{operation} triggered
   # Then operation output
   # Finally: [timestamp] exit=0 (or non-zero if failed)
   ```

3. **Browser button:**
   - Open dashboard in browser
   - Click button
   - Observe operation runs (logs appear in real-time if SSE is working)
   - Button shows running state

## Known Issues

- **Claude Code CLI slowness:** Spawning `claude` adds ~2–5 second startup latency per operation. For frequently-triggered operations, consider caching or direct Node.js invocation if the skill is available as a library.
- **Unconfirmed simultaneous operations:** Both dashboards prevent starting an operation if one is already running (state guard `if (pipelineState.running) return { ok: false }`), but there's no check to prevent the SAME operation from being triggered on both dashboards at once. This is usually fine (sequential execution in logs), but be aware if you're running both dashboards simultaneously.

## Real-World Example: Adding Scan Button

The scan button was added to the React dashboard in May 2026 following this pattern exactly:

1. Created `scan-run.mjs` wrapper
2. Added `scanState` and `SCAN_LOG` to both dashboards
3. Added `startScan()` function to both dashboards (copy-paste + rename from `startPipeline`)
4. Added `/api/scan` endpoint to both dashboards
5. Added `window.__live.runScan()` to HTML
6. Added button to `scan-queue.jsx`

Result: Scan button works identically to pipeline button, logs to the same location, shares the same state management pattern.

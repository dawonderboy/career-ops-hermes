# Dashboard Pipeline & Scan Button Fix (May 2026)

## Status note

Canonical current reference for dashboard action-button wiring after the May 2026 wrapper fix, if `pipeline-run.mjs` and `scan-run.mjs` are present in the active repo and trigger logs show real execution. Cross-check `web-dashboard-pipeline-trigger-bug.md` only for the historical failure mode. Do not modify dashboard app logic from this reference unless Robin explicitly asks for a code change.


## Problem

Both dashboards' "Run Pipeline" and "Run Scan" buttons were broken.

**Root cause**: The original code called Claude Code CLI with a prompt-mode `-p` flag:

```javascript
spawn(CLAUDE_BIN, ['-p', '/career-ops pipeline', '--permission-mode', 'bypassPermissions', ...])
```

Claude Code's `-p` prompt mode does NOT recognize slash-commands like `/career-ops`. It treats the input as natural language, causing:
```
Unknown command: /career-ops
exit=1
```

## Solution

Create thin wrapper scripts that properly invoke the CLI with a full English prompt:

### pipeline-run.mjs

```javascript
#!/usr/bin/env node
/**
 * pipeline-run.mjs — Wrapper to invoke `/career-ops pipeline` via Claude Code CLI.
 * Called by dashboards when the "run pipeline" button is clicked.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Invoke Claude Code CLI with the /career-ops pipeline skill
// Using the full prompt format to trigger the skill
const proc = spawn('claude', [
  '-p',
  'Run /career-ops pipeline',
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

### scan-run.mjs

Identical to `pipeline-run.mjs` except change prompt to `'Run /career-ops scan'`.

## Integration Steps

### 1. Create Wrapper Scripts

Place `pipeline-run.mjs` and `scan-run.mjs` in project root.

### 2. Update web-dashboard.mjs

**Old (broken):**
```javascript
const proc = spawn(CLAUDE_BIN, ['-p', '/career-ops pipeline', '--permission-mode', 'bypassPermissions', '--output-format', 'text'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

**New (fixed):**
```javascript
const proc = spawn('node', ['./pipeline-run.mjs'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

Do the same for `web-dashboard.react.mjs`.

### 3. Add /api/scan Endpoint

Both dashboards need the scan endpoint. Add right after `/api/pipeline`:

```javascript
if (url.pathname === '/api/scan' && req.method === 'POST') {
  const result = startScan();
  if (!result.ok) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: result.error, startedAt: scanState.startedAt }));
    return;
  }
  res.writeHead(202, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
  return;
}
```

Create `scanState` and `startScan()` function parallel to pipeline versions.

### 4. Wire Frontend

In `mock/Career Ops Dashboard.html`:

```javascript
window.__live.runScan = async function () {
  const r = await fetch("/api/scan", { method: "POST" });
  return r.json().catch(() => ({}));
};
```

In `mock/scan-queue.jsx`, add button:

```jsx
<button onClick={() => window.__live?.runScan()} style={{...}}>
  🔍 Run scan now
</button>
```

## Testing

After deploying:

1. Restart dashboards
2. Click "Run Pipeline Now" button — should see pipeline status in logs
3. Click "Run Scan Now" button — should see scan status in logs
4. Check `/api/pipeline-status` and `/api/scan-status` endpoints
5. Verify logs at `logs/pipeline-trigger.log` and `logs/scan-trigger.log`

## Why This Works

The wrapper scripts call Claude Code CLI once with the full prompt `'Run /career-ops pipeline'`. This prompt is recognized by Claude Code, which then invokes the skill. The shell subprocess communicates back to the dashboard via logs and exit codes.

Key insight: Claude Code CLI **does** recognize `/career-ops` when it's part of a full English prompt (not just passed as a raw slash-command). The wrapper converts dashboard button clicks into natural-language prompts the CLI understands.

## Pitfalls Learned

- **Do NOT** try to pass `/career-ops pipeline` as a raw argument to `-p`. Always construct a full sentence: `'Run /career-ops pipeline'`.
- **Do NOT** call Claude Code CLI directly from the dashboard code. Always use a wrapper script to handle stdio/lifecycle.
- **Test both dashboards** — they have parallel implementations that both need the fix.

## Session Reference

May 6, 2026 session: Added scan button to dashboards + fixed pipeline button with wrapper invocation.

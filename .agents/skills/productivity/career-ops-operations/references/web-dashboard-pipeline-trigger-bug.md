# Web Dashboard Pipeline Trigger — Historical Failure Mode (May 2026)

## Status note

This file documents the original May 2026 failure mode. Before treating it as current, check whether `references/dashboard-button-wrapper-fix.md` and the repo's current `pipeline-run.mjs` / `scan-run.mjs` wrappers are present. If wrappers exist and logs show real execution, this is historical context, not current state.

**Original failure:** The `/api/pipeline` endpoint in `web-dashboard.mjs` (port 3737) and `web-dashboard.react.mjs` (port 3940) **does not trigger the pipeline runner**. Clicking "Run pipeline" in either dashboard returns a successful HTTP 202 response, but the pipeline does not actually execute.

**Root cause:** Both dashboards spawn `CLAUDE_BIN` with the prompt `/career-ops pipeline`, which Claude Code CLI does not recognize.

## Symptom

When you click "Run pipeline" in either dashboard, the logs show:
```
[timestamp] /api/pipeline triggered (react)
Unknown command: /career-ops
[timestamp] exit=0
```

The HTTP response is `{"ok":true,"startedAt":"2026-05-06T21:41:31.211Z"}`, falsely signaling success. No actual pipeline work occurs.

## Affected Code

**web-dashboard.mjs** line 464:
```javascript
const proc = spawn(CLAUDE_BIN, ['-p', '/career-ops pipeline', '--permission-mode', 'bypassPermissions', '--output-format', 'text'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

**web-dashboard.react.mjs** line 435:
```javascript
const proc = spawn(CLAUDE_BIN,
  ['-p', '/career-ops pipeline', '--permission-mode', 'bypassPermissions', '--output-format', 'text'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
```

Both use the same flawed pattern.

## Why It Doesn't Work

- `CLAUDE_BIN` resolves to `/Users/robinletim/.nvm/versions/node/v24.15.0/bin/claude` (Claude Code CLI v2.1.122)
- Claude Code CLI's `-p` flag expects a natural-language prompt (e.g., `-p "summarize this file"`)
- It does **not** parse slash-command syntax like `/career-ops` or slash-prefixed skill invocations
- The CLI reads `/career-ops pipeline` as a literal prompt string, fails to parse it as a command, and exits cleanly (exit code 0) with "Unknown command" message

## Workaround if the current service still shows this historical failure

If current verification shows the wrapper fix is absent or logs still show `Unknown command`, run the pipeline manually from terminal:

```bash
cd /Users/robinletim/career-ops
node cv-sync-check.mjs
node scan.mjs        # if you want to scan for new offers first
# Then manually run the pipeline via Hermes or Claude Code CLI directly
```

Or use the automation wrapper:
```bash
./career-ops-automation.sh scan-now
```

## Fix Options

### Option 1: Direct Node invocation (Simplest)

Create a wrapper script `pipeline-run.mjs` in the repo root:

```javascript
#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const proc = spawn('node', ['./pipeline.mjs'], {
  cwd: resolve(process.cwd()),
  stdio: 'inherit',
});

process.exit(proc.exitCode ?? 0);
```

Then update both dashboards to call this instead:
```javascript
const proc = spawn('node', [resolve(ROOT, 'pipeline-run.mjs')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
```

### Option 2: Shell script wrapper (If complex invocation needed)

Create `scripts/run-pipeline.sh`:
```bash
#!/bin/bash
cd "$(dirname "$0")/.."
node cv-sync-check.mjs && node scan.mjs && node merge-tracker.mjs && node verify-pipeline.mjs
```

Then both dashboards invoke it:
```javascript
const proc = spawn('bash', [resolve(ROOT, 'scripts', 'run-pipeline.sh')], { cwd: ROOT, ... });
```

### Option 3: Proper CLI skill invocation

If the Claude Code CLI or another current CLI supports `/career-ops` as a skill slash-command from within `-p` prompts:
```javascript
const proc = spawn(CLAUDE_BIN, ['-p', 'Please run the /career-ops pipeline skill', ...], { ... });
```

This requires verifying CLI support first.

## Impact

- **User-visible:** The "Run pipeline" button appears to work (responds with HTTP 202) but does nothing
- **UX problem:** No clear error feedback; user clicks button, sees no output, and doesn't know the pipeline failed silently
- **Automation impact:** Scheduled/automated pipeline triggers via the dashboard are broken; use the shell-script automation wrapper (`career-ops-automation.sh`) or direct CLI instead

## Testing current state or a fix

Verify both dashboards only after confirming the live service scheme/port in the current environment. Do not assume HTTP vs HTTPS without checking the running service.

```bash
# Test original dashboard pipeline endpoint
curl -s -k -X POST https://127.0.0.1:3737/api/pipeline | jq '.ok'

# Test React dashboard pipeline endpoint
curl -s -k -X POST https://127.0.0.1:3940/api/pipeline | jq '.ok'

# Verify logs show actual pipeline execution (not "Unknown command")
tail -20 /Users/robinletim/career-ops/logs/pipeline-trigger.log
```

After the fix, the logs should show pipeline work output, not just `Unknown command`.

## Related

- Both dashboards also support `/api/pipeline-status` (GET) to check if pipeline is running.
- The automation wrapper `career-ops-automation.sh` already provides a working pipeline trigger via `./career-ops-automation.sh scan-now`.

# Web Dashboard Pipeline Button Fix

## Problem

Both `web-dashboard.mjs` and `web-dashboard.react.mjs` had broken `/api/pipeline` POST endpoints. When the run-pipeline button was clicked, the dashboards attempted to spawn Claude Code CLI with:

```javascript
spawn(CLAUDE_BIN, ['-p', '/career-ops pipeline', '--permission-mode', 'bypassPermissions', ...])
```

**Root cause:** Claude Code CLI's `-p` (prompt) flag expects natural language, not slash-command syntax. The CLI returned `Unknown command: /career-ops` and the pipeline silently failed.

## Solution

Create a thin wrapper script `pipeline-run.mjs` that properly invokes the CLI:

```javascript
#!/usr/bin/env node
import { spawn } from 'node:child_process';

const proc = spawn('claude', [
  '-p',
  'Run /career-ops pipeline',  // Natural language prompt, not a slash-command
  '--permission-mode', 'bypassPermissions',
  '--output-format', 'text'
], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

proc.on('exit', code => process.exit(code || 0));
proc.on('error', err => {
  console.error(`Failed to spawn claude: ${err.message}`);
  process.exit(1);
});
```

The key difference: `'Run /career-ops pipeline'` is a natural-language prompt that Claude Code CLI recognizes as a request to invoke the skill. The skill system then matches `/career-ops pipeline` and executes the correct mode.

## Implementation

1. **Create** `/Users/robinletim/career-ops/pipeline-run.mjs` with the wrapper above
2. **Update** `web-dashboard.mjs` line ~464:
   ```javascript
   // OLD:
   const proc = spawn(CLAUDE_BIN, ['-p', '/career-ops pipeline', '--permission-mode', 'bypassPermissions', '--output-format', 'text'], { ... });
   
   // NEW:
   const proc = spawn('node', ['./pipeline-run.mjs'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
   ```
3. **Update** `web-dashboard.react.mjs` line ~435:
   ```javascript
   // OLD:
   const proc = spawn(CLAUDE_BIN, ['-p', '/career-ops pipeline', '--permission-mode', 'bypassPermissions', '--output-format', 'text'], { ... });
   
   // NEW:
   const proc = spawn('node', ['./pipeline-run.mjs'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
   ```
4. **Restart** both dashboard processes
5. **Verify:**
   ```bash
   curl -X POST http://127.0.0.1:3737/api/pipeline | jq .
   curl -s -k -X POST https://127.0.0.1:3940/api/pipeline | jq .
   tail /Users/robinletim/career-ops/logs/pipeline-trigger.log
   ```

Expected output: `{ "ok": true, "startedAt": "2026-05-06T..." }`

## Why This Works

- **Direct Node invocation** avoids the Claude Code CLI overhead
- **Natural-language prompt** (`'Run /career-ops pipeline'`) lets Claude Code CLI's skill system recognize and execute the career-ops skill
- **Wrapper isolation** means dashboard code doesn't need to know about CLI quirks — it just spawns a simple script

## Session Example (May 6, 2026)

Both dashboards were broken. The original investigation showed that `Unknown command: /career-ops` appeared in `/Users/robinletim/career-ops/logs/pipeline-trigger.log` even though the endpoint returned HTTP 202 (accepted). Root cause: the CLI invocation pattern was invalid.

After the fix:
- React dashboard: `curl -s -k -X POST https://127.0.0.1:3940/api/pipeline` → `{ "ok": true, "startedAt": ... }`
- Original dashboard: `curl -X POST http://127.0.0.1:3737/api/pipeline` → `{ "ok": true, "startedAt": ... }`
- Pipeline log shows clean execution: `The pipeline is empty — no pending URLs to process.` (expected behavior when pipeline.md has no pending items)

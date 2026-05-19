# Server Boot State Seeding from Log Files

## Problem

`pipelineState` and `scanState` in `web-dashboard.react.mjs` are initialized to `null` on every server start. This causes the UI to show `"last: never"` even when pipelines have been run many times in prior sessions — the state is purely in-memory and not persisted.

## Solution: seedStateFromLogs() Pattern

Add an IIFE immediately after the state object declarations. It runs synchronously at module load, before any HTTP request is served.

```js
(function seedStateFromLogs() {
  function parseLastRun(logPath) {
    if (!existsSync(logPath)) return null;
    try {
      const text = readFileSync(logPath, 'utf-8');
      // Find all [ISO-timestamp] markers
      const startMatches = [...text.matchAll(/\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]/g)];
      // Find the last exit= line
      const exitMatches = [...text.matchAll(/\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\] exit=(\d+)/g)];
      if (!exitMatches.length) return null;
      const last = exitMatches[exitMatches.length - 1];
      const finishedAt = last[1];
      const exitCode = parseInt(last[2], 10);
      // Find the start marker that preceded this exit
      const finTs = new Date(finishedAt).getTime();
      const priorStarts = startMatches.filter(m => new Date(m[1]).getTime() < finTs);
      const startedAt = priorStarts.length ? priorStarts[priorStarts.length - 1][1] : finishedAt;
      return { startedAt, finishedAt, exitCode };
    } catch {
      return null;
    }
  }
  const ps = parseLastRun(PIPELINE_LOG);
  if (ps) {
    pipelineState.startedAt = ps.startedAt;
    pipelineState.finishedAt = ps.finishedAt;
    pipelineState.exitCode = ps.exitCode;
  }
  const ss = parseLastRun(SCAN_LOG);
  if (ss) {
    scanState.startedAt = ss.startedAt;
    scanState.finishedAt = ss.finishedAt;
    scanState.exitCode = ss.exitCode;
  }
})();
```

## Log Format

The server writes logs in this format (both pipeline and scan logs):
```
[2026-05-14T05:20:43.303Z] /api/pipeline triggered
...stdout output...
[2026-05-14T05:21:11.391Z] exit=0
```

The parser relies on this exact format. If the log format changes, update the regex patterns.

## Frontend: Prefer finishedAt over startedAt

In `PipelineStatusCard` (HTML inline script):

```js
// Use finishedAt (when run completed) rather than startedAt (when it began)
// Fall back to "not recorded" instead of "never" when no log exists yet
const lastRun = (status?.finishedAt || status?.startedAt)
  ? new Date(status.finishedAt || status.startedAt).toLocaleString(undefined,
      { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  : "not recorded";
```

## Where This Lives

- `web-dashboard.react.mjs` lines ~520-560 (after `pipelineState` / `scanState` declarations)
- `logs/pipeline-trigger.log` — pipeline run history
- `logs/scan-trigger.log` — scan run history
- Both log files are created automatically by `mkdirSync` on first run

## Generalization

This pattern applies whenever a Node.js server has in-memory state that needs to survive restarts:
1. Write structured log entries with ISO timestamps and exit codes during the run
2. On boot, parse the log to seed the state object
3. Expose the seeded state via an API endpoint
4. On the frontend, handle null gracefully ("not recorded" not "never")

Do NOT use `Date.now()` as the timestamp unless a run actually completed in this session.

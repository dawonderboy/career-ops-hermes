# Model split for Career-Ops scan vs pipeline

Durable repo convention established during a May 2026 maintenance session.

## Combined scan entrypoint (added May 2026)

`npm run scan` now runs `scan-all.mjs`, which executes BOTH scanner layers sequentially:
1. `node scan.mjs` — provider/company scan (Greenhouse, Ashby, Lever, Workday)
2. `node scan-job-boards.mjs` — job-board aggregator scan (Ever Jobs, JSearch, Adzuna, etc.)

Individual layers can still be run in isolation:
- `npm run scan:providers` → `node scan.mjs` only
- `npm run scan:boards` → `node scan-job-boards.mjs` only

The scan button in `scan-run.mjs` (invoked by dashboards) still dispatches to Claude Code CLI with `Run /career-ops scan`. The combined behavior is now part of that entrypoint.

## Goal

Use ChatGPT/OpenAI for discovery scans, but keep Claude responsible for the heavier writing path (reports and CVs).

## Entry-point mapping

- `scan-run.mjs` should use `codex exec ...`.
- `pipeline-run.mjs` should continue using `claude -p ...`.

Interpretation:
- Scan = discovery/orchestration step
- Pipeline = evaluation/writing step that produces reports and CV/PDF outputs

## Why this matters

The dashboard has separate buttons/wrappers for scan and pipeline. A user may explicitly want different models behind them. Do not assume both wrappers should use the same CLI.

## Verification pattern after changing wrappers

```bash
node --check scan-run.mjs
node --check pipeline-run.mjs
codex exec --dangerously-bypass-approvals-and-sandbox -C /path/to/repo "Reply with exactly: CODEX_OK"
```

Use the Codex smoke test to confirm the OpenAI/ChatGPT-backed wrapper can launch in the target repo. Keep the pipeline wrapper unchanged unless the user explicitly wants Claude removed from report/CV generation too.

## Current desired split in this repo

- Scan button / `scan-run.mjs` → Codex CLI (OpenAI / ChatGPT)
- Pipeline button / `pipeline-run.mjs` → Claude Code

## See also

- `references/pipeline-title-quality-patterns.md` — which pipeline titles to evaluate vs skip fast, and how to dedup before evaluation batches

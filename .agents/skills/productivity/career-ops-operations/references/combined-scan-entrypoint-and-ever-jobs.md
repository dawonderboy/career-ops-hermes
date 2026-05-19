# Combined scan entrypoint + Ever Jobs wiring

Durable repo behavior established in May 2026.

## What `/career-ops scan` should mean in this repo

The scan workflow should run both discovery layers, sequentially:

1. `scan.mjs`
   - Provider/company scan
   - Reads `tracked_companies`
   - Resolves providers from explicit `provider:` or URL auto-detection
   - Current built-in providers: Greenhouse, Ashby, Lever, Workday

2. `scan-job-boards.mjs`
   - Job-board / aggregator scan
   - Reads `job_board_integrations`
   - Handles boards/parsers like JSearch, Adzuna, Ever Jobs, etc.

Recommended package scripts:
- `npm run scan` -> `node scan-all.mjs`
- `npm run scan:providers` -> `node scan.mjs`
- `npm run scan:boards` -> `node scan-job-boards.mjs`

## Why this matters

A user can add additional discovery sources to `job_board_integrations` and reasonably expect `/career-ops scan` to use them. If the workflow only runs `scan.mjs`, those sources are silently ignored.

## Ever Jobs specifics

`ever_jobs` is configured under `job_board_integrations`, not `tracked_companies`.
That means:
- `scan.mjs` will never use it
- `scan-job-boards.mjs` is the relevant scanner

For Ever Jobs to participate in discovery:
- `job_board_integrations.ever_jobs.enabled` must be `true`
- the local API must be running at `http://localhost:3001`
- the combined scan flow must include `scan-job-boards.mjs`

## Troubleshooting interpretation

If a user says they "added other trackers" or added Ever Jobs and it was not used:
- inspect whether the source lives under `tracked_companies` vs `job_board_integrations`
- explain which script consumes which config block
- verify whether `npm run scan` / dashboard wiring actually invokes both scanners
- verify Ever Jobs local API availability separately from config

## Durable repo lesson

When scan coverage and `portals.yml` semantics drift apart, prefer fixing the entrypoint/wrapper so the user-facing command matches the configuration model, rather than telling the user to remember multiple manual scan commands.
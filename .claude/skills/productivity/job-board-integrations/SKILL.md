---
name: job-board-integrations
description: "Integrate external job boards and aggregators into a job-search pipeline. Covers config wiring, parser mapping, request formats, dedup, and verification."
version: 1.0.0
---

# Job Board Integrations

Use this skill when adding a new job board, ATS source, or aggregator feed to a job-search pipeline.

Reference files:
- `references/job-board-integrations-ever-jobs.md` for a concrete self-hosted POST integration pattern (Ever Jobs)
- `references/career-ops-ever-jobs-tuning.md` for the tuned Career-Ops split between Ever Jobs (focused local discovery) and JSearch (broader complementary RapidAPI discovery), including timeout and quota-management lessons
- `references/provider-driven-scanner-quirks.md` for current provider-driven scanner patterns and ATS-specific quirks

## When to use
- Adding a new source to a scanner or aggregator
- Wiring a third-party API into an existing portal config
- Normalizing a new response shape into the pipeline's job schema
- Debugging title/location filtering or duplicate ingestion for a source

## Workflow
1. Identify the source contract
   - HTTP method, endpoint, auth, request body/query params
   - Response shape and paging model
   - Rate limits / cooldown behavior

2. Decide how the source fits the pipeline
   - Search board vs ATS vs company page vs aggregator
   - Whether it should be enabled by default or kept disabled until local setup is ready
   - Which parser should own the normalized shape

3. Wire the config
   - Add the integration under the appropriate `job_board_integrations` section
   - Keep the integration disabled by default if it depends on local services or user keys
   - Store API credentials in env vars, not inline

4. Add parsing/normalization
   - Map source fields into the scanner's canonical job object
   - Normalize locations before filters run
   - Preserve URLs exactly so dedup stays stable
   - If the source uses nested objects, flatten only what the pipeline needs

5. Verify end-to-end
   - Validate YAML/JSON syntax after editing config
   - Run a syntax check or dry-run for the scanner script
   - Confirm the parser returns the expected fields
   - Confirm dedup/history logic prevents double ingestion
   - For provider-driven scanners, verify the shared HTTP helper and provider modules load before blaming a source-specific endpoint
   - For local/self-hosted aggregators, test the source directly with a health check and one manual POST before debugging the Career-Ops wrapper
   - If the source works directly but the wrapper aborts, inspect scanner timeout behavior before concluding the API is broken

## Pitfalls
- **The two-layer confusion is the most common mistake.** `scan.mjs` only reads `tracked_companies`. `scan-job-boards.mjs` only reads `job_board_integrations`. A board configured under `job_board_integrations` will NEVER appear in a `node scan.mjs` run. Always run both via `npm run scan` (which calls `scan-all.mjs`). See `references/provider-driven-scanner-quirks.md` for the full breakdown.
- Do not assume all sources use GET; many aggregators expect POST bodies.
- Do not enable a new source by default if it depends on a local server or fresh credentials.
- Do not let raw nested location objects reach the filter stage unnormalized.
- Do not bypass dedup; source additions should still respect existing history/pipeline/app tracker checks.
- If a source fans out into many boards, prefer a single integration point with a stable parser instead of many near-duplicate entries.
- **Adzuna location quirk:** `where: "San Francisco Bay Area"` returns 0 results. Use `where: "San Francisco, CA"` instead. Long OR-chains in `what:` also return 0 — use a single tight phrase like `"IT Support Engineer"`. See `references/career-ops-ever-jobs-tuning.md` for the working config.

## Practical verification checklist
- Config parses cleanly
- Script passes syntax check / lint
- The new parser returns title, company, location, url, and any useful metadata
- A sample response can be round-tripped into the pipeline
- The integration is documented in a short reference note for future reuse

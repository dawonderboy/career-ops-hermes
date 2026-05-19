---
description: Scan the local Ever Jobs aggregator and ingest matching results into Career-Ops
---

Run a targeted Career-Ops scan against the local/self-hosted Ever Jobs aggregator.

Instructions:
1. Ensure the Ever Jobs API is reachable at http://localhost:3001/api/jobs/search.
2. Read the current value of `job_board_integrations.ever_jobs.enabled` in `portals.yml` and remember it.
3. Temporarily set `job_board_integrations.ever_jobs.enabled: true` in `portals.yml`.
4. Run `node scan-job-boards.mjs --board ever_jobs` from the project root.
5. Restore the original `job_board_integrations.ever_jobs.enabled` value in `portals.yml` even if the scan fails.
6. Report a concise summary of how many new offers were added and whether any errors occurred.
7. Do not evaluate or apply to jobs here — only ingest and stage new offers into the pipeline.

# Provider-driven scanner quirks

This note captures the current pattern used by Career-Ops-style scanners when integrating ATS sources.

## TWO SEPARATE SCANNER LAYERS — critical distinction

Career-Ops runs two completely independent scanner scripts. Confusing them is the most common source of "why didn't my board get scanned?" confusion.

| Layer | Script | What it reads | What it ignores |
|-------|--------|---------------|-----------------|
| Provider/company scan | `scan.mjs` | `portals.yml → tracked_companies` | Everything in `job_board_integrations`, `aggregators`, `search_queries`, `api_provider` field |
| Job-board aggregator scan | `scan-job-boards.mjs` | `portals.yml → job_board_integrations` | `tracked_companies`, `aggregators`, `search_queries` |

`npm run scan` (via `scan-all.mjs`) runs BOTH layers sequentially. Before `scan-all.mjs` existed, only `scan.mjs` ran — so boards configured under `job_board_integrations` were silently skipped.

Fields that do NOT make a `tracked_companies` entry runnable in `scan.mjs`:
- `api_provider:` — this is metadata only; `scan.mjs` resolves providers by URL auto-detection or explicit `provider:` field
- `scan_method: websearch` — metadata; `scan.mjs` has no websearch execution path
- `scan_query:` — not read by `scan.mjs` at all

Fields that the provider scanner DOES resolve on:
- `provider: greenhouse|ashby|lever|workday` — explicit override
- auto-detection: `careers_url` or `api` containing `greenhouse.io`, `ashbyhq.com`, `lever.co`, `myworkdayjobs.com`

If a company has `api_provider: workday` but NOT `provider: workday`, `scan.mjs` will still auto-detect it correctly from the URL — but if the URL is missing or doesn't match, it will be counted in the "skipped — no provider matched" bucket.

## What changed

- The main portal scanner is provider-driven: `scan.mjs` loads `providers/*.mjs` at startup.
- A shared HTTP helper often lives in `providers/_http.mjs`.
- A missing helper or provider module is a setup bug, not a reason to fall back to the old browser-first assumptions.

## Source-specific notes

- Greenhouse: prefer `absolute_url` when present; otherwise build the public job URL from board slug + job id only when that board style is known to be stable.
- Ashby: hosted boards often embed a rich `window.__appData` payload in the HTML; parse that before inventing a custom API endpoint.
- Lever: feeds commonly return an array at the root; look for `hostedUrl`/`applyUrl`.
- Workday: list APIs often use POST JSON bodies with `appliedFacets`, `limit`, `offset`, and `searchText`.

## Failure modes to treat carefully

- HTTP 429 from job-board aggregators is usually rate limiting, not a fatal scanner bug.
- A source that lacks an explicit API URL should not be guessed if the platform depends on one for zero-token scanning.
- If the scanner reports a mismatch between console counts and pipeline rows, verify the written tracker/history files before trusting the summary.

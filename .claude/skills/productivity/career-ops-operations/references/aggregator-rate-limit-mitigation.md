# Aggregator rate-limit mitigation

Observed May 2026 while running `scan-job-boards.mjs` with RapidAPI-backed boards.

## Symptom

Repeated 429s from RapidAPI-backed job-board endpoints such as:
- `indeed_scraper`
- `linkedin_job_search`

A noisier version also produced aborted requests from another board in the same scan burst.

## Durable mitigation pattern

For `scan-job-boards.mjs` or similar multi-board aggregator scans:

1. Lower parallelism for board fetches.
   - Example improvement used here: `CONCURRENCY` from `5` down to `3`

2. Add retry/backoff for transient board failures.
   - retry on `HTTP 429`
   - retry on `5xx`
   - retry on aborted/timeouts
   - use exponential backoff
   - honor `Retry-After` when present

3. Stagger RapidAPI-hosted board requests.
   - Detect `*.p.rapidapi.com`
   - sleep before each board request using board index × stagger delay
   - this reduces burstiness even before retries kick in

## Practical implementation used

Constants added:

```js
const CONCURRENCY = 3;
const MAX_FETCH_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1500;
const RAPIDAPI_STAGGER_MS = 1200;
```

Behavior added:
- shared `sleep(ms)` helper
- `fetchJson()` retry loop
- pre-fetch delay for RapidAPI hosts only

## Validation pattern

```bash
node --check scan-job-boards.mjs
node scan-job-boards.mjs
```

Expected outcome:
- some 429-prone providers may still rate-limit
- overall scan should be quieter and lose fewer boards to transient aborts
- compare before/after error counts, not just whether all 429s disappeared

## Important framing

Do not encode this as "RapidAPI boards are broken".
The durable lesson is pacing + retry strategy, not a permanent negative claim about the providers.

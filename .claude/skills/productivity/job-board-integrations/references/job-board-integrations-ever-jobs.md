# Ever Jobs local setup + Career-Ops integration

Use this when Career-Ops has an `ever_jobs` entry under `job_board_integrations` and the user wants that source to participate in normal scans.

## Durable integration pattern

1. `career-ops scan` should not stop at `scan.mjs`.
   - Provider/company discovery and job-board discovery are different layers.
   - The combined scan entrypoint should run both:
     - `node scan.mjs`
     - `node scan-job-boards.mjs`

2. Ever Jobs belongs to the job-board layer, not the provider layer.
   - Config lives under `job_board_integrations.ever_jobs`
   - Typical fields:
     - `enabled: true|false`
     - `api_endpoint: http://localhost:3001/api/jobs/search`
     - `method: POST`
     - `parser: ever_jobs`
     - `request_body: ...`

3. If the service is local/self-hosted, verify it independently before blaming Career-Ops.
   - Health endpoint: `GET /health`
   - Search endpoint: `POST /api/jobs/search`
   - For the upstream Ever Jobs repo, Docker Compose is the fastest path.

## Local startup recipe that worked

Repo location used in session:
- `/Users/robinletim/ever-jobs`

Minimal `.env` was enough for local use when auth/rate-limit friction was undesirable:
- `ENABLE_API_KEY_AUTH=false`
- `ENABLE_CACHE=false`
- `RATE_LIMIT_ENABLED=false`
- `PORT=3001`
- `NODE_ENV=production`

Start:
- `cd /Users/robinletim/ever-jobs && docker compose up -d --build`

Verify:
- `curl http://localhost:3001/health`
- `curl -X POST http://localhost:3001/api/jobs/search -H 'Content-Type: application/json' --data '{...}'`

Observed healthy container name:
- `ever-jobs-api`

Useful lifecycle commands:
- `docker compose ps`
- `docker logs --tail 200 ever-jobs-api`
- `docker compose restart`
- `docker compose down`

## Important timeout lesson

Ever Jobs can respond successfully but still look broken to Career-Ops if the board scanner timeout is too short.

Observed pattern:
- direct POST to Ever Jobs succeeded
- total request time was ~30s because LinkedIn-heavy source mixes were slow
- Career-Ops `scan-job-boards.mjs` had a fixed 15s timeout
- result: `This operation was aborted` / fetch-abort despite a healthy local API

Durable fix pattern:
1. Allow per-board timeout override in `scan-job-boards.mjs`
   - pass `timeoutMs: boardConfig.timeout_ms` into the fetch helper
   - in the fetch helper, prefer `options.timeoutMs || FETCH_TIMEOUT_MS`
2. Set a longer timeout for slow local aggregators
   - example: `job_board_integrations.ever_jobs.timeout_ms: 45000`

## Verification target after wiring

Run:
- `npm run scan:boards -- --dry-run --board ever_jobs`

Successful verification in session produced:
- board recognized by scanner
- jobs returned from Ever Jobs
- Career-Ops title/location filters reduced the set
- dry-run surfaced 2 high-signal local matches

## API response quirks

- `/api/jobs/search` returns HTTP **201** (not 200) on success. This is correct NestJS behavior. Do not treat 201 as an error when testing.
- The `jobs` array is always present even when empty; check `count` for the total.
- `location` field is a nested object `{city, state, country}`, not a string. The Career-Ops parser handles this via `normalizeLocation()`. If writing a custom parser, flatten it before the location filter stage.
- ATS-type sources (greenhouse, lever, ashby, workday) inside Ever Jobs require a `companySlug` to return results. Without it, they return 0. For general discovery queries without a slug, only search-based sources (linkedin, google, remoteok, etc.) return results.
- LinkedIn inside Ever Jobs is the highest-yield source for Bay Area internal IT roles. Other sources (indeed, glassdoor) often return 403 from Ever Jobs's container context.

## Default branch

The upstream repo uses `develop` as the default branch. Docker Compose builds from whatever is checked out locally — no branch change needed for standard use.



- Do not assume `api_provider` or `scan_method` makes Ever Jobs runnable in `scan.mjs`; it does not.
- Do not debug the Career-Ops parser first if `localhost:3001/health` is down.
- Do not leave LinkedIn-heavy site mixes on a 15s fetch timeout and then conclude the integration is broken.
- Do not treat provider scans and job-board scans as interchangeable; they are separate layers and should both run in the full scan workflow.

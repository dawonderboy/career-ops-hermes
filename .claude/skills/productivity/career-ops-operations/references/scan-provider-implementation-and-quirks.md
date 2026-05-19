# Scan provider implementation and quirks

This reference captures the current zero-token portal scanner architecture and the real-world provider details discovered while repairing scan execution.

## Current architecture

- `scan.mjs` now loads providers from `providers/*.mjs` at startup.
- Shared HTTP utilities live in `providers/_http.mjs` and expose `makeHttpCtx()`.
- Provider modules are conventionally named after ATS/platform families, e.g. `greenhouse.mjs`, `ashby.mjs`, `lever.mjs`, `workday.mjs`.
- `scan-job-boards.mjs` is a separate aggregator scanner and should be treated as distinct from the portal provider layer.

## Helpful patterns

- Greenhouse provider can derive a public job URL from either `absolute_url` or a board slug plus job id.
- Ashby pages often embed the full board payload in `window.__appData`; parsing that HTML can be more reliable than trying to infer a GraphQL endpoint.
- Workday list endpoints usually accept POST JSON with `appliedFacets`, `limit`, `offset`, and `searchText`.
- Lever job feeds often return an array at the root with `hostedUrl` or `applyUrl` as the public link.

## Quirks observed during repair

- Some historical mode docs still describe the scanner as browser-first. Treat that as stale when it conflicts with `scan.mjs`.
- JSearch / aggregator APIs may rate-limit with HTTP 429; scans should treat that as a retryable or non-fatal board-level issue rather than a hard pipeline failure.
- When a provider entry lacks an explicit `api:` and the platform requires one, the scan should fail clearly instead of guessing.
- If `scan.mjs` errors with a missing `providers/_http.mjs`, the provider layer is incomplete; restore the shared helper plus at least the platform modules in the scan path.

## Verification notes

- `node --check providers/_http.mjs providers/*.mjs scan.mjs`
- `node scan.mjs`
- `node verify-pipeline.mjs`

## Small examples

- Ashby public board URL example: `https://jobs.ashbyhq.com/{slug}/{job-id}`
- Greenhouse API example: `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs`
- Workday API example: `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

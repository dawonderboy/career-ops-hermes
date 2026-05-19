# Scan scope: provider scanner vs query-only trackers

Durable repo behavior confirmed in a May 2026 Career-Ops scan session.

## What `node scan.mjs` actually reads

Current `scan.mjs` reads only:
- `tracked_companies`
- `title_filter`
- `location_filter`

It resolves each enabled `tracked_companies` entry to a provider plugin and only scans entries that resolve successfully.

## Provider path used by `scan.mjs`

Supported provider plugins currently loaded from `providers/*.mjs`:
- `greenhouse`
- `ashby`
- `lever`
- `workday`

Resolution rules:
1. `provider:` field wins if present
2. otherwise auto-detect from `api` / `careers_url`
3. if no provider matches, the company is skipped

Typical scan summary line:
- `Scanning 112 companies via providers (52 skipped — no provider matched)`

Interpret that literally: the skipped entries existed in `portals.yml` but were outside the provider-backed execution path.

## Important mismatch in `portals.yml`

`portals.yml` can contain richer tracker shapes than `scan.mjs` currently executes:

### 1. Query-only tracker blocks
Entries with fields like:
- `query:`
- `enabled:`

These are not consumed by current `scan.mjs`.

### 2. `aggregators:` block
Examples:
- Remotive
- RemoteOK
- HN Who's Hiring

These may be documented in `portals.yml`, but current `scan.mjs` does not read the `aggregators:` block.

### 3. `scan_method: websearch` + `scan_query:`
These fields are currently metadata / intent markers for many tracked companies. Current `scan.mjs` does not execute websearch scanning from those fields.

### 4. `api_provider:` is not the dispatch key
Current `scan.mjs` dispatches from:
- explicit `provider:`
- or URL auto-detection

Do not assume `api_provider:` makes an entry runnable.

## Practical operator guidance

When a user says they added more trackers and asks why they were not used:
1. explain that `node scan.mjs` is currently the provider-backed tracked-company scanner
2. state that query-only trackers, `aggregators:`, and `scan_method/websearch` entries are not executed by that path
3. distinguish between `provider:` and `api_provider:`
4. if needed, enumerate skipped companies as "present in config but outside current scan execution path"

## Recommended fix framing

Prefer proposing a proper split rather than pretending the current scanner is broader than it is:
- quick fix: teach `scan.mjs` to honor `api_provider` and/or some query-style entries
- proper fix: implement a second scan path for query-trackers and aggregators, then merge through the same dedup / pipeline flow

Recommended wording: prefer the proper fix unless the user explicitly wants a minimal patch.

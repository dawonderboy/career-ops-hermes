# HubSpot careers GraphQL notes

Use when Robin wants HubSpot included in Career-Ops scans.

## What was verified
- Public careers page: `https://www.hubspot.com/careers/jobs`
- The site is live and renders job listings in-browser.
- It does **not** use Greenhouse, Ashby, or Lever.
- It uses a custom GraphQL backend exposed at:
  - `https://wtcfns.hubspot.com/careers/graphql`

## Useful discovered fields
GraphQL query root exposes at least:
- `search(searchQuery: String!)`
- `jobs(officeIds: [Int], departmentIds: [Int], roleTypes: [String], languages: [String], searchQuery: String)`
- `job(id: ID!)`
- `offices`
- `departments`

Observed relevant department names:
- `Business Technology`
- `Operations`
- `Revenue Operations`
- `Security`

Observed job detail URL pattern:
- `https://www.hubspot.com/careers/jobs/{id}?hubs_signup-cta=careers-apply`

## Operational implication for Career-Ops
Adding HubSpot to `portals.yml` with `scan_method: websearch` is valid for manual/agent-guided targeting, but the current zero-token `scan.mjs` will still skip it because `scan.mjs` only auto-detects/scans Greenhouse, Ashby, and Lever APIs.

If Robin says "include HubSpot in scans," do two separate things:
1. add/update the HubSpot tracked-company entry in `portals.yml`
2. explicitly state whether that only adds tracking metadata or whether `scan.mjs` was also extended to support HubSpot GraphQL

## Good search query seed
Use a websearch/manual-targeting query like:
`site:www.hubspot.com/careers/jobs "Business Technology" OR "Corporate IT" OR "IT Support" OR "Technical Support" OR "Systems Administrator" OR "Endpoint" OR "Workplace Technology"`

## Future implementation direction
If extending `scan.mjs`, add a dedicated HubSpot provider rather than pretending it is a generic websearch-only source. Detection should key off `www.hubspot.com/careers/jobs` or the `wtcfns.hubspot.com/careers/graphql` backend and query `jobs(...)` / `job(id)` directly.
# Ever Jobs integration notes

Use this when integrating a self-hosted Ever Jobs aggregator into Career-Ops.

Key facts:
- Local REST endpoint: POST http://localhost:3001/api/jobs/search
- Main response array: jobs[]
- Useful fields: title, companyName, jobUrl, location, datePosted, isRemote, compensation
- Search body shape:
  - searchTerm: string
  - country: string (e.g. USA)
  - resultsWanted: number
  - siteType: array of source ids (e.g. linkedin, indeed, glassdoor, greenhouse, lever, ashby, workday, smartrecruiters, recruitee)
  - descriptionFormat: markdown/plain/html
  - linkedinFetchDescription: boolean

Integration pattern in Career-Ops:
- Add a job_board_integrations entry in portals.yml with enabled, api_endpoint, method: POST, parser: ever_jobs, and request_body.
- Extend scan-job-boards.mjs to support POST payloads.
- Add an ever_jobs parser that maps Ever Jobs fields into the scanner's normalized job shape.

Pitfalls:
- Keep the integration disabled by default until the local API is running.
- Avoid duplicate tracker ingestion by relying on scan-history and existing pipeline dedup.
- If the API response uses nested location objects, normalize them before filtering.
- Use GET only when the integration truly expects query-string params; Ever Jobs expects POST.

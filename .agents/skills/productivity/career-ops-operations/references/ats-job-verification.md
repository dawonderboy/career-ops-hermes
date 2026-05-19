# ATS job verification notes

Session-derived workflow for direct Career-Ops URL evaluations.

## Greenhouse

Use the public structured endpoint when the board slug and job ID are visible in the URL:

`https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}?content=true`

What it gives you:
- `first_published`
- `updated_at`
- `requisition_id`
- canonical `absolute_url`
- `location`
- HTML `content`

Interpretation pitfall:
- A very old `first_published` date with a recent `updated_at` date is not an automatic ghost-job verdict, but it should usually downgrade legitimacy from `High Confidence` to `Proceed with Caution` until you confirm whether the role is evergreen, a backfill, or actively being staffed.

Recommended sequence:
1. Open the live posting in the browser and confirm the Apply button exists.
2. If `browser_navigate` or the accessibility snapshot comes back empty on a modern careers page, immediately try `browser_console` with `document.body.innerText` before assuming the JD is inaccessible.
3. Query the Greenhouse boards API to confirm freshness and collect structured metadata.
4. Use both sources in the legitimacy section: browser for liveness, API for dates/IDs/content.

Empty-page fallback learned from Upstart:
- Some branded careers pages render a blank `browser_navigate` snapshot but still expose the full JD via `document.body.innerText`.
- This is especially common when the public URL is a custom careers domain wrapping Greenhouse.
- In those cases, keep the user-facing URL as the report URL, but still pull structured metadata from the Greenhouse boards API using the Greenhouse job ID.

## Shell/tooling pitfall

Do not assume `python` is present as `python` for quick command-line probes. Prefer already-verified tools such as `node` or `curl`, or verify the interpreter name first.

## Single-offer auto-pipeline convention

When the user pastes a single JD URL after `career-ops`, treat it as an auto-pipeline run:
- create the report
- generate the tailored resume PDF for `>= 3.0` when that matches current project convention
- write a TSV under `batch/tracker-additions/`
- run `node merge-tracker.mjs --verify`
- run `node verify-pipeline.mjs`
- report absolute output paths in the completion message

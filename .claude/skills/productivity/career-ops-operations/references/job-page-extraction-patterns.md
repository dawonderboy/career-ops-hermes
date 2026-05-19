# Job Page Extraction Patterns

Use this reference when a job URL, ATS page, government posting, or branded careers page does not expose a complete JD through the first browser snapshot.

## Core rule

Do not treat an empty or truncated accessibility snapshot as proof that a job is inaccessible or closed. First verify with Playwright/browser extraction and, when possible, the underlying ATS/API.

## Standard extraction order

1. Open the public job URL with the browser.
2. Capture the page title and final URL.
3. Read the accessibility snapshot for visible title, location, apply state, and high-level structure.
4. If the snapshot is empty, sparse, or truncated, run `browser_console` with:

```js
document.title + "
" + location.href + "

" + document.body.innerText
```

5. Use `document.body.innerText` as the primary rendered-text source when it contains the full JD.
6. If an ATS API exists, query it to confirm liveness, freshness, requisition ID, office/department, and structured location.
7. Preserve enough source text in a report or `jds/*.md` local file to make the evaluation reproducible.

## Known rendered-page patterns

- LinkedIn public job pages: A sign-in modal does not always mean the JD is unavailable. First dismiss the modal if possible, then use `browser_snapshot` and `browser_console(expression="document.body.innerText")` to extract the public job text. LinkedIn can expose title, company, location, posted age, applicant count, apply state, responsibilities, requirements, and compensation without login. Only mark `[!] login required` after the modal cannot be dismissed or body text does not contain the JD.

- ADP / Workforce Now: static HTML often contains only the shell. Browser text can expose title, location, requisition ID, posting age, responsibilities, and comp fields. If a `Compensation Range` label appears without numbers, record salary transparency as missing; do not infer a band.
- GovernmentJobs / NEOGOV: accessibility snapshots may truncate after header sections. `document.body.innerText` usually contains salary, job number, department, opening/closing dates, qualifications, required attachments, competencies, and selection-process notes.
- Gem: `browser_navigate` may show an empty page or generic title while body text contains the full JD, company blurb, compensation, work authorization questions, and free-text prompts.
- Workday: snapshots can be empty while body text includes title, location, posted age, requisition ID, employment type, salary range, overtime eligibility, responsibilities, and qualifications.
- Greenhouse corporate wrappers: branded company pages can block automation while the Greenhouse API still returns the live JD. Extract board slug and job ID, then query the API.
- Jobvite: accessibility snapshots are very sparse (heading + a few links only). `document.body.innerText` reliably returns the complete rendered JD including title, location, salary, responsibilities, and qualifications. The presence of an Apply link in the snapshot confirms liveness. Use `browser_console(expression="document.body.innerText")` as the primary extraction path for Jobvite URLs — do not rely on the snapshot alone.
- Ashby application forms (`/application` route): When the user navigates to the `/application` URL directly (e.g. from LinkedIn), the browser snapshot exposes the full form structure — field labels, required markers, dropdowns, radio groups, and custom screening questions — all in the accessibility tree. Use this to pre-populate the Application Answers doc with exact question text before the user sits down to apply. Click the "Overview" tab to load the JD text, then `browser_console(expression="document.body.innerText")` for full content including comp range. The form snapshot + Overview text together give everything needed for a complete apply pack without any separate API call.

## LinkedIn special case

- LinkedIn may show a sign-in modal while the public JD is still present behind it.
- Try dismissing the modal and extracting `document.body.innerText` before marking the item blocked.
- If the full JD text is available, record liveness signals such as apply button, posted age, applicant count, title, company, location, responsibilities, requirements, and compensation.
- Only mark the pipeline item `[!] login required` after the modal cannot be dismissed or body text does not contain the JD.

## Manual or pasted JD input

If the user pastes a full JD instead of a URL:

- Treat it as a manual evaluation input, not as a fetch failure.
- Save the pasted JD under `jds/{company-role-YYYY-MM-DD}.md` when an evaluation/report will be created.
- Use `local:jds/...` in the report `**URL:**` field so the evaluation remains reproducible.
- Preserve freshness, location, comp, requisition ID, and apply instructions if present.
- Still follow tracker safety: report file, TSV under `batch/tracker-additions/`, `node merge-tracker.mjs`, then `node verify-pipeline.mjs`.

## Liveness cautions

- Footer/nav-only pages without title, JD body, or apply controls are likely closed.
- A title + description + apply path is active unless another authoritative source says otherwise.
- For Greenhouse `job-boards.greenhouse.io/{board}/jobs/{id}`, a 404 from `boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}` plus redirect to `/{board}?error=true` is a strong closed signal.

## Verification

After extraction, record in the report or notes:

- Source URL or local JD path
- Page title and final URL if browser was used
- ATS/API endpoint if used
- Apply state: active, closed, blocked, or unconfirmed
- Freshness markers such as posted date, updated date, requisition ID, or job number

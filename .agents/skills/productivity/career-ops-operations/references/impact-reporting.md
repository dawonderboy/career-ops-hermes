# Career-Ops impact / ROI reporting

Use this reference when the user wants presentation-ready stats showing how much Career-Ops has helped their job hunt.

## Data sources

Read live repo data instead of estimating:

- `data/applications.md`
  - total tracked roles
  - unique companies
  - status counts
  - score distribution
  - submitted applications
  - employer response rate
  - interview rate
- `data/scan-history.tsv`
  - total scan events
  - roles added to queue
  - title-filtered rows
  - deduplicated rows
  - location-filtered rows
  - expired / unverified rows
- `reports/`
  - evaluation-report volume
- `output/`
  - resume PDFs
  - cover-letter PDFs
  - application-answer PDFs
  - total generated PDFs
- `interview-prep/`
  - interview-prep PDF count

## Status normalization

Do not equate tracker rows with submitted applications.

Treat these as submitted / externally-advanced states for funnel metrics:

- `Applied`
- `Responded`
- `Interview`
- `Offer`
- `Rejected`

Treat these separately:

- `Evaluated`
- `Discarded`
- `SKIP`

## Recommended presentation structure

Split the value story into four layers:

1. Discovery volume
   - opportunities scanned
   - roles surfaced into queue
2. Filtering efficiency
   - title mismatches filtered automatically
   - duplicates avoided
   - low-fit / closed roles avoided
3. Execution output
   - reports generated
   - resume PDFs
   - cover letters
   - application-answer docs
   - interview-prep docs
4. Outcome funnel
   - submitted applications
   - employer responses
   - interview-stage roles
   - rejected / closed outcomes

## Good headline metrics

- opportunities scanned
- roles surfaced into queue
- roles tracked/evaluated
- submitted applications
- employer responses
- interview-stage roles
- response rate on submitted applications
- interview rate on submitted applications
- high-fit roles (`>= 4.0/5`)
- self-filtered / closed roles avoided
- generated application assets

## Export rules

- If the user says `export` or wants something presentable, generate a PDF directly in `output/`.
- Do not leave a markdown artifact as the final deliverable.
- Verify the exported PDF with:
  - `file <path>`
  - `ls -lh <path>`
- Include a short methodology note so the numbers are defensible.

## Pitfalls

- `data/scan-history.tsv` can produce misleading totals if parsed loosely; validate final status buckets before presenting metrics.
- Do not present the `applications.md` row count as `applications submitted`.
- Do not collapse discovery, filtering, execution, and outcome into one vanity number; the value is the combination.

## Session example (2026-05-06)

A successful report combined:

- tracker counts from `data/applications.md`
- scanner throughput from `data/scan-history.tsv`
- asset counts from `output/` and `interview-prep/`
- a PDF built directly with Python `reportlab`
- verification via `file` and `ls -lh`

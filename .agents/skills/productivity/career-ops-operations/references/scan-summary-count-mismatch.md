# Scan summary count mismatch

Observed 2026-05-06 during `career-ops scan`.

Failure mode:
- `node scan.mjs` console summary reported `New offers added: 1`
- actual repo state showed 2 queued additions
  - `data/pipeline.md` gained Box and Verkada pending items
  - newest `data/scan-history.tsv` rows both had status `added`

Practical rule:
1. If the console count looks suspicious, do not report it blindly.
2. Re-read `data/pipeline.md` and inspect the newest `data/scan-history.tsv` rows.
3. Treat repo state as authoritative over the console summary.

Why it matters:
- prevents underreporting newly queued roles
- avoids skipping follow-up on a real pending item

Session example:
- Scan console: `New offers added: 1`
- Actual additions verified in repo:
  - `https://job-boards.greenhouse.io/boxinc/jobs/7895313`
  - `https://job-boards.greenhouse.io/verkada/jobs/4134221007`

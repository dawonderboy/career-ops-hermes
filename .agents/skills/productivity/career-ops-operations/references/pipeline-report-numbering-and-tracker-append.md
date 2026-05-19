# Pipeline Report Numbering & Tracker TSV Addition Pattern

Session note: this reference was originally written after a 2026-05-06 pipeline evaluation. It has been updated to match the current tracker safety contract.

## Report File Naming

**Pattern:** `reports/{###}-{slug}-{YYYY-MM-DD}.md`

**Components:**
- `{###}`: Sequential report number. Find the next number with:
  ```bash
  cd /Users/robinletim/career-ops && ls -1 reports/ | grep -oE '^[0-9]+' | sort -n | tail -1
  # Returns max number; add 1 for next report
  ```
- `{slug}`: Company name or role identifier, lowercase with hyphens.
- `{YYYY-MM-DD}`: Evaluation date.

## Report File Structure

Standard headers required for verification:

```markdown
# Evaluation: {Role} — {Company}

**URL:** {full_posting_url}

**Score:** {float}/5

**Legitimacy:** Tier {1|2|3}

**PDF:** ✅/❌

---

## Summary

[2-3 sentence summary of role, company, verdict]
```

Key sections:
- Summary / verdict upfront
- Assessment / fit analysis
- Why proceed or why skip
- Role details extracted from the JD
- Recommendation and next steps

## Tracker TSV Addition Pattern

Current tracker write contract:

Net-new tracker entries must not be written directly to `data/applications.md`.

For brand-new roles:

1. Create TSV additions under `batch/tracker-additions/`.
2. Run `node merge-tracker.mjs`.
3. Run `node verify-pipeline.mjs`.

Direct edits to `data/applications.md` are allowed only for updating existing rows/status/notes when an explicit workflow permits it.

Adding brand-new roles directly to `data/applications.md` is forbidden, even for small batches.

Write one TSV file per net-new evaluated role:

```text
batch/tracker-additions/{num}-{company-slug}.tsv
```

TSV column order is status before score:

```text
{ID}	{date}	{company}	{role}	{status}	{score}/5	{pdf}	[{ID}](reports/{###}-{slug}-{YYYY-MM-DD}.md)	{notes}
```

Components:
- `{ID}`: intended report/tracker ID. For possible existing roles, first load `manual-jd-reevaluation-existing-tracker-row.md` and check company+role.
- `{date}`: evaluation date (`YYYY-MM-DD`).
- `{company}`: company name as in JD/report.
- `{role}`: job title as in JD/report.
- `{status}`: canonical status, usually `Evaluated` for a fresh evaluation.
- `{score}/5`: score as float with `/5`.
- `{pdf}`: ✅ or ❌ indicating whether a tailored PDF was generated.
- report link: `[{ID}](reports/{###}-{slug}-{YYYY-MM-DD}.md)`.
- `{notes}`: one-line notes; avoid embedded newlines.

Example TSV lines:

```text
259	2026-05-06	Murphy McKay & Associates	Event Support Technician	Evaluated	1.5/5	❌	[259](reports/259-murphy-mckay-2026-05-06.md)	Evaluated 2026-05-06 — Entry-level event tech ($30/hr, ~$62K), severe compensation gap, seniority mismatch, travel burden. Recommend skip.
260	2026-05-06	Stanford University	IT Systems Analyst	Evaluated	3.2/5	❌	[260](reports/260-stanford-2026-05-06.md)	Evaluated 2026-05-06 — Legitimate analyst-level role, Palo Alto location strong, compensation/scope need clarification before advancement.
```

## Tracker TSV Implementation

Use a tool-safe file write to create the TSV. Example shell shape for humans:

```bash
mkdir -p batch/tracker-additions
printf '%s	%s	%s	%s	%s	%s	%s	%s	%s
'   "259" "2026-05-06" "Murphy McKay & Associates" "Event Support Technician"   "Evaluated" "1.5/5" "❌"   "[259](reports/259-murphy-mckay-2026-05-06.md)"   "Evaluated 2026-05-06 — Entry-level event tech; recommend skip."   > batch/tracker-additions/259-murphy-mckay.tsv

node merge-tracker.mjs
node verify-pipeline.mjs
```

For Hermes agents, prefer `write_file` for the TSV file and then run the merge/verify commands. Do not use shell append, Python insertion, or `mcp_Patch` to create net-new applications rows.

## Pipeline Update

**File:** `data/pipeline.md`

For processed pending entries, replace the original `- [ ]` lines with processed `- [x]` lines that include the report ID and score:

```markdown
## Processed
- [x] #259 | {url} | {company} | {role} | {score}/5 | PDF ❌
- [x] #260 | {url} | {company} | {role} | {score}/5 | PDF ❌
```

Before editing pipeline state, check for existing URL/company/role to avoid duplicates.

## Verification

After report, TSV, merge, and pipeline updates:

```bash
node merge-tracker.mjs
node verify-pipeline.mjs
```

Expected healthy result includes canonical statuses, valid report links, valid scores, properly formatted rows, and no unexpected pending TSVs.

If verification fails:
- inspect the specific row(s) named by the verifier
- confirm the TSV has exactly 9 tab-separated fields
- confirm report links exist
- confirm the row starts with a single `| ` after merge
- separate pre-existing tracker debt from the current update in the final report

## Session Example (2026-05-06) — updated for current contract

Input: 2 pending jobs (Murphy McKay, Stanford)

Current safe process:
1. Find max report ID: `258` → next is `259`.
2. Use workers for extraction/scoring if helpful, but keep writes centralized.
3. Create reports: `259-murphy-mckay-2026-05-06.md`, `260-stanford-2026-05-06.md`.
4. Write 2 TSV additions under `batch/tracker-additions/`.
5. Run `node merge-tracker.mjs`.
6. Update pipeline entries as processed.
7. Run `node verify-pipeline.mjs`.
8. Report evaluated count, PDF count, and verification result.

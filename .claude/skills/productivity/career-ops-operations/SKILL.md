---
name: career-ops-operations
description: "Operate the Career-Ops job-search pipeline safely: setup checks, scan, pipeline, tracker verification, dashboards, email ingest, apply packs, and common pitfalls."
version: 1.1.0
author: Hermes Agent
license: MIT
platforms: [macos]
metadata:
  hermes:
    tags:
      - career-ops
      - job-search
      - pipeline
      - tracker
      - dashboard
      - scan
      - interview-prep
    related_skills:
      - career-ops-interview-stage-filters
      - interview-prep-and-research
      - company-research-interview-context
      - job-board-integrations
      - job-tracker-archival
      - google-workspace
      - markdown-and-html-to-pdf
---

# Career-Ops Operations

Use this skill for Career-Ops scans, evaluations, tracker/dashboard work, email ingest, interview prep, apply packs, and pipeline operations.

Production manual rule: do not append new content to this `SKILL.md` until it is safely below the Hermes skill size limit. Add new material to `references/*.md` and update `references/index.md` instead. Keep this file as a router, safety contract, and verification checklist.

## Operating model

- Hermes is the orchestration layer: inspect state, choose the correct reference, run/verify commands, and report results.
- For Career-Ops repo work, follow `references/token-saving-orchestration-policy.md`: keep Hermes/Claude responsible for execution loops, summarize logs/diffs, and use ChatGPT only for initial prompts, final review, high-risk judgment, or blocked-state recovery.
- Use the active Hermes model for orchestration; delegate bounded code creation, code modification, debugging, and docs work to Claude when appropriate.
- Career-Ops scans may use Node scripts, direct ATS APIs, explicit provider integrations, or aggregator providers. Do not hardcode a Codex-only or single-provider assumption.
- macOS is the current primary environment. Treat WSL/Linux paths in older notes as legacy unless the task explicitly targets that environment.

## Data safety boundaries

Do not touch Career-Ops application logic unless the user explicitly asks. Do not modify live tracker data, application history, personalized resumes/CVs, interview metadata, generated apply packs, or user-specific runtime data unless the requested workflow requires it and the reference says how to verify it.

Never overwrite personalized files: `cv.md`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, `portals.yml`, `data/*`, `reports/*`, `output/*`, and `interview-prep/*`.

User-specific customization belongs in `config/profile.yml`, `modes/_profile.md`, or `article-digest.md`; never put it in `modes/_shared.md`.

Never submit a job application for the user. Draft, fill, and prepare materials only; stop before final Submit/Send/Apply.

## Tracker write contract — safety critical

- New tracker entries must be written as TSV files under `batch/tracker-additions/`.
- After creating TSV additions, run `node merge-tracker.mjs`.
- Then run `node verify-pipeline.mjs`.
- Direct edits to `data/applications.md` are allowed only for updating existing rows/status/notes when a workflow explicitly permits it.
- Adding brand-new roles directly to `data/applications.md` is not allowed, even for small batches.
- Before creating a report/tracker addition, check for an existing company+role in `data/applications.md` and `data/pipeline.md`.
- Do not trust stale dashboard state without tracker verification.

TSV column order is status before score:

```text
{num}	{date}	{company}	{role}	{status}	{score}/5	{pdf_emoji}	[{num}](reports/{num}-{slug}-{date}.md)	{note}
```

## First-session and setup checks

At the first Career-Ops interaction in a session, run silently:

```bash
node update-system.mjs check
```

If status is `update-available`, tell Robin an update is available and ask before applying. Say nothing for `up-to-date`, `dismissed`, `offline`, or `no-remote-version`.

Before meaningful operations, confirm required files exist:

```bash
for f in cv.md config/profile.yml modes/_profile.md portals.yml data/applications.md; do
  if [ -f "$f" ]; then echo "OK $f"; else echo "MISSING $f"; fi
done
```

Do not use brace globs with `search_files` for required-file checks; they can produce false negatives. If `modes/_profile.md` is missing, copy it from `modes/_profile.template.md` before continuing. If setup basics are missing, follow the repository onboarding flow instead of evaluating/scanning.

## Load this reference when...

| Task or symptom | Load |
|---|---|
| Need the full reference map | `references/index.md` |
| Auditing or repairing this skill's documentation safety rules | `references/documentation-safety-audit-pattern.md` |
| Live ATS/job liveness verification | `references/ats-job-verification.md` |
| Rendered job page, empty snapshot, ADP, Workday, Gem, GovernmentJobs/NEOGOV, pasted JD | `references/job-page-extraction-patterns.md` |
| Token/cost-saving repo orchestration, ChatGPT boundary, or Claude/Hermes execution policy | `references/token-saving-orchestration-policy.md` |
| Codebase health audit / “what needs repair?” repo review | `references/codebase-health-audit-pattern.md` |
| Repo cleanup after a health audit (ignores, hardcoded paths, scan wrapper, test behavior) | `references/repo-cleanup-after-health-audit.md` |
| Public README fork positioning, upstream attribution, Hermes additions, dashboards, or sanitized email/ntfy docs | `references/public-readme-fork-positioning.md` |
| Dashboard service, long-running scan/pipeline button, or port issue | `references/web-dashboard-long-running-operations.md` |
| React dashboard operations | `references/react-dashboard-operational-guide.md` |
| React dashboard architecture or scan queue issue | `references/react-dashboard-architecture-and-scan-queue.md` |
| Tracker/dashboard mismatch | `references/tracker-dashboard-sync-pitfalls.md` and `references/tracker-dashboard-multi-layer-sync-verification.md` |
| Duplicate tracker/report cleanup | `references/duplicate-cleanup-manual-approach.md` |
| Existing role re-evaluation or CV regeneration | `references/re-evaluate-existing-role-and-regenerate-cv.md` |
| Manual JD re-evaluation of a possible existing row | `references/manual-jd-reevaluation-existing-tracker-row.md` |
| Pipeline pending items may duplicate existing evaluated roles before delegation | `references/pipeline-pre-dedup-before-delegation.md` |
| Pending or stale URL sweep | `references/pending-url-liveness-sweeps.md` |
| Aggregator rate-limit/cooldown/query tuning | `references/aggregator-rate-limit-and-query-tuning.md` |
| Aggregator URLs re-added as duplicate pending jobs | `references/aggregator-url-canonicalization-and-duplicate-cleanup.md` |
| JSearch broad scan tuning | `references/jsearch-broad-scan-tuning.md` |
| Ever Jobs integration | `references/job-board-integrations-ever-jobs.md` |
| Public sector (GovernmentJobs/NEOGOV, CA agencies, classification series, union, supplemental Q) | `references/public-sector-evaluation-patterns.md` |
| Scan provider implementation quirks | `references/scan-provider-implementation-and-quirks.md` |
| Robin-specific scan targeting | `references/robin-targeting-scan-tuning.md` |
| Apply pack generation | `references/apply-pack-workflow.md` and `references/apply-pack-pdf-only-ashby-forms.md` |
| Resume/CV work-history ordering issue | `references/pdf-generation-work-history-ordering.md` and `references/apply-pack-resume-work-history-ordering-pitfall.md` |
| Screening questionnaire responses | `references/screening-questionnaire-responses.md` |
| Recruiter call to hiring-manager prep | `references/recruiter-call-to-hm-prep-workflow.md` |
| Interview invite to prep | `references/interview-invite-to-prep-workflow.md` |
| Interview prep confirmation/reminder | `references/interview-prep-confirmation-workflow.md` |
| Company research for interview context | load `company-research-interview-context` skill and relevant interview-prep references |
| Email ingest broken or stale | `references/email-ingest-health-diagnostics.md` |
| ntfy silence, backlog, or transport loss | `references/email-ingest-ntfy-stall.md` and `references/email-ingest-ntfy-transport-loss.md` |
| Calendar invite/date parsing problem | `references/email-ingest-calendar-header-invites.md` and `references/email-ingest-datetime-fallback.md` |
| Parser migration/recovery | `references/parser-migration-recovery.md`, `references/parser-restoration-env-inheritance.md`, and legacy migration references |
| Kanban pipeline/bootstrap/stage-save issue | `references/kanban-pipeline-bootstrap.md` and `references/kanban-stage-save-snapback.md` |

## Unified verification checklist

Before operations:

- Run `node update-system.mjs check` if this is the first Career-Ops interaction in the session or the user asked about updates.
- Confirm required files exist.
- Identify whether the task touches user data, tracker state, generated files, app logic, dashboard service state, or external systems.
- Load the relevant reference file before acting.
- If evaluating/generating PDFs, run `node cv-sync-check.mjs` when available.

After codebase health audits:

- Run non-mutating checks first: `node doctor.mjs`, `node verify-pipeline.mjs`, `node test-all.mjs`, and targeted dashboard tests when relevant.
- Re-run any failed `test-all.mjs` subcommand directly to capture the real underlying error.
- Classify findings as code defects, environment/toolchain gaps, repo hygiene/portability issues, or tracker/data warnings that need human judgment.
- Do not modify tracker/user data during an audit unless Robin explicitly asks for repair.

After scans:

- Run `node verify-pipeline.mjs`.
- Inspect `data/pipeline.md` for new pending entries and formatting.
- Inspect the newest `data/scan-history.tsv` rows if counts look wrong.
- Report companies/providers scanned, jobs found, title/location removals, duplicates skipped, new offers added, errors, and verification limits.
- If no new offers were added, say so clearly and do not run evaluations.

After evaluations:

- Confirm each report exists under `reports/{###}-{slug}-{YYYY-MM-DD}.md`.
- Confirm report headers include `**URL:**`, `**Score:**`, `**Legitimacy:**`, and `**PDF:**` or equivalent PDF/reference field required by the current mode.
- Confirm TSV additions were created in `batch/tracker-additions/` for new tracker entries.
- Run `node merge-tracker.mjs`.
- Run `node verify-pipeline.mjs`.
- Confirm processed pipeline item state and no duplicate company+role was introduced.

After tracker changes:

- Confirm no duplicate rows for the affected company+role.
- Confirm status is canonical per `templates/states.yml`.
- Confirm archived sections remain machine-parseable if touched.
- Confirm dashboard state reflects tracker state; do not trust dashboard alone.

After dashboard changes:

- Syntax-check relevant `.mjs`/JS files.
- Run available build/test checks when applicable.
- Confirm the correct service/port: Node dashboard on 3737, React dashboard on 3940.
- Browser-smoke-test the affected UI if browser tools are available.

After PDF/apply-pack generation:

- Confirm final PDF exists and is non-empty.
- Confirm final deliverables match the user's PDF-only preference.
- Confirm resume/CV work history is strict reverse chronological.
- Do not present Markdown/HTML/render scripts as final deliverables.
- Stop before final Submit/Send/Apply.

## Top-level workflows

### Scan workflow

- Load `modes/_shared.md`, `modes/scan.md`, `portals.yml`, and the relevant scan reference.
- Run the scanner command requested by the user or documented by the reference.
- Verify with `node verify-pipeline.mjs`.
- Cross-check `data/pipeline.md` and `data/scan-history.tsv` if console counts look inconsistent.
- For Robin-specific title/location tuning, load `references/robin-targeting-scan-tuning.md` and edit `portals.yml` only.

### Pipeline/evaluation workflow

- Load `modes/_shared.md`, `modes/pipeline.md`, `data/pipeline.md`, and the extraction/evaluation references.
- Before delegating extraction/scoring, pre-deduplicate pending rows against `data/applications.md` and processed `data/pipeline.md` by company + normalized role title; load `references/pipeline-pre-dedup-before-delegation.md` when a pending item may be a repost or alternate URL.
- For job URLs, verify liveness with browser/ATS extraction. Do not trust stale web summaries.
- For rendered or tricky pages, load `references/job-page-extraction-patterns.md`.
- For 2+ net-new or uncertain pending roles, parallelize JD extraction/scoring with `delegate_task` if useful, but keep all file writes centralized in the main agent.
- Create reports, create TSV tracker additions, run `node merge-tracker.mjs`, then `node verify-pipeline.mjs`.
- Do not create new tracker rows directly in `data/applications.md`.

### Apply-pack / live application workflow

- Load `modes/apply.md`, the matching report, tracker row, CV/profile files, and apply-pack references.
- Confirm the score is apply-worthy or that Robin explicitly wants to proceed despite risk.
- Generate final materials as PDFs when requested/expected.
- Verify resume work-history order before reporting success.
- Stop at sign-in/account creation/final submit and tell Robin what remains.

### Interview prep workflow

- Load the matching report, tracker row, CV/profile files, and the relevant interview-prep reference.
- Store prep PDFs under `interview-prep/{Company} - {Role}/` unless Robin explicitly asks for another location.
- Use PDF as the final deliverable; do not leave Markdown as the final artifact.
- If tracker/interview label mismatches the requested prep type, create what Robin requested and note the mismatch visibly.

### Email ingest / ntfy workflow

- Do not treat ntfy silence as proof email ingest is healthy.
- Load `references/email-ingest-health-diagnostics.md` first, then the specific ntfy/parser/calendar reference.
- Check process status, logs, parser identity/auth visibility, ntfy backlog behavior, and tracker/dashboard reflection.
- Prefer bounded diagnostics before restarting services or replaying backlogs.

### Public README / fork documentation workflow

- Load `references/public-readme-fork-positioning.md` before editing the public README.
- Make the README explicit about what came from upstream Career-Ops versus what Robin added around it.
- Document `career-ops-operations` as the Hermes operational runbook, not as upstream product code.
- Document all dashboard entrypoints together: original Node web dashboard (`web-dashboard.mjs`, commonly 3737), React web dashboard (`web-dashboard.react.mjs` + `mock/`, commonly 3940), and Go terminal dashboard (`dashboard/`).
- Document email ingest + ntfy as a sanitized private add-on pattern without exposing forwarding addresses, topics, tokens, mailbox details, or recruiter/email contents.
- After pushing README changes, fetch the live raw GitHub README and verify the expected new sections are present; use a cache-busting URL if GitHub raw content is stale.

### Dashboard workflow

- Clarify which dashboard is affected if ambiguous: Node dashboard on 3737 or React dashboard on 3940.
- When documenting Career-Ops dashboards publicly, mention all dashboard entrypoints together: original Node web dashboard (`web-dashboard.mjs`, commonly 3737), React web dashboard (`web-dashboard.react.mjs` + `mock/`, commonly 3940), and Go terminal dashboard (`dashboard/`). Do not only document the React dashboard just because it was the most recent focus.
- Load the relevant dashboard reference.
- Verify tracker state first, then API state, then UI state.
- For UI/app code changes, syntax-check/build/test and browser-smoke-test before final reporting.

## Highest-risk pitfalls

- Do not add brand-new roles directly to `data/applications.md`; use TSV additions plus `node merge-tracker.mjs`.
- Do not overwrite personalized files or generated final artifacts without explicit workflow need.
- Do not trust dashboard state without tracker/API verification.
- Do not trust a stale or closed ATS posting without browser/ATS liveness verification.
- Do not assume empty browser snapshots mean no JD; load `references/job-page-extraction-patterns.md`.
- Do not generate or deliver apply packs without checking reverse-chronological work history.
- Do not add tools or technologies to a tailored resume unless they appear in cv.md or Robin explicitly confirms he used them. The evaluation report's Block E recommends what would help — it does not verify what Robin actually did. cv.md is the source of truth.
- Always save the HTML source file alongside the PDF in the output folder. Without the HTML, corrections require a full rebuild from scratch.
- Do not mark `Applied` unless Robin confirms submission.
- Do not leave generated `.html`, `.md`, preview artifacts, render scripts, or stale hidden files as final deliverables when PDF-only output is expected.
- Do not treat ntfy silence as health; check logs/backlog/parser state.
- Do not retry blocked or denied commands in a loop. Switch to read-only inspection and report the verification limit.

## Maintenance rules for this skill

- Keep `SKILL.md` compact. Add operational detail to references and update `references/index.md`.
- After repairing this skill, run `scripts/validate-career-ops-skill.py` when file tools/terminal access are available; it checks size, frontmatter, index coverage, forbidden direct-tracker-add phrases, duplicate JD-extraction text, and numbered-list anomalies.
- Patch outdated references immediately when a workflow changes.
- If a reference contains historical Codex/WSL/Linux notes, label them legacy unless still current for the task.
- Keep safety-critical tracker, application-submit, PDF-only, and liveness-verification rules in this main file.

# Documentation Safety Audit Pattern

Use this reference when repairing or auditing the `career-ops-operations` skill documentation itself, especially after a second-pass review finds stale workflow guidance across multiple references.

## Goal

Keep the skill library consistent with the current Career-Ops safety contract without changing application logic, live tracker data, generated PDFs, reports, resumes, or runtime artifacts.

## Scope boundaries

- Documentation-only means edit `SKILL.md`, `references/*.md`, `templates/*`, or `scripts/*` inside the skill package only.
- Do not modify Career-Ops app logic, `data/applications.md`, generated apply packs, reports, CV PDFs, or interview-prep outputs during a docs audit unless the user explicitly asks for those changes.
- Do not delete historical references just because they are stale. Add a clear status banner such as `Historical failure mode` or `Legacy context` and point to the current canonical reference.
- Do not rename reference files unless the user explicitly asks; stable filenames preserve links from `references/index.md` and prior sessions.

## Safety-critical contract to enforce

For net-new tracker rows, references must say:

1. create one TSV file per evaluation in `batch/tracker-additions/`;
2. run `node merge-tracker.mjs`;
3. run `node verify-pipeline.mjs`;
4. direct creation of new rows in `data/applications.md` is forbidden, including small batches.

Direct edits to `data/applications.md` are only for repairing or updating existing rows when the selected workflow permits it.

## Audit targets

Search the skill references for stale or unsafe language around:

- shell redirection into `data/applications.md`;
- Python scripts that create net-new rows directly in the tracker;
- instructions that treat archived non-9-column tracker tables as acceptable steady state;
- dashboard bug references that read as current when a wrapper or architecture fix is already canonical;
- email-ingest health checks that equate a live PID, quiet logs, or ntfy silence with health;
- replay instructions without bounded windows and duplicate-effect checks;
- examples that print secret values from `.env`, process environments, or credential files.

When patching secret examples, use presence/length checks or editor-based instructions. Never include raw keys or `[REDACTED]` placeholders as if they were real examples.

## Preferred repair shape

- Main `SKILL.md`: keep compact; add or update routing/safety pointers only.
- `references/index.md`: add one concise row for any new reference and update stale descriptions.
- Focused references: add status notes, current-contract callouts, and verification steps near the top so future agents see them before legacy details.
- Historical docs: preserve the narrative, but label it as historical and point to the current procedure.

## Verification checklist

When terminal/file tools are available after the edits:

1. Run `scripts/validate-career-ops-skill.py` from the skill directory or by absolute path.
2. Search the skill references for unsafe tracker-write phrases and ensure any matches are only negative safety warnings.
3. Search email/parser references for commands that display full secret values.
4. Confirm `references/index.md` includes every new reference file.
5. Confirm `SKILL.md` stays safely below the Hermes skill size limit.

Report validation results separately from functional Career-Ops state. A documentation audit should not claim anything about live scanner, dashboard, parser, or tracker health unless those systems were explicitly checked.
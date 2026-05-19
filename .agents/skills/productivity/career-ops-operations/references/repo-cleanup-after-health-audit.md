# Repo cleanup after a Career-Ops health audit

Use this reference when Robin asks to clean up issues found by a read-only codebase inspection. The goal is small, reviewable hygiene repairs without breaking live Career-Ops behavior or touching user/job data.

## Safety sequence

1. Capture a snapshot first:
   - `git status --short`
   - tracked modified files: `git diff --name-only`
   - untracked files: `git ls-files --others --exclude-standard | sed -n '1,200p'`
2. Do not delete anything during cleanup unless Robin explicitly listed it.
3. Avoid mutating tracker/pipeline data while testing scripts. If a validation accidentally runs a real scan and adds a row, remove only the exact row introduced by that accidental run and note it in the final report.
4. Validate after each group with the smallest relevant checks before running the full suite.

## Build/runtime artifact cleanup

- Ignore build outputs, not whole projects, unless Robin explicitly approves moving/removing the project.
- For Swift/Xcode projects accidentally inside Career-Ops, ignore `NotchPrompter/.build/` but leave source files visible for a later decision.
- Runtime state such as `data/job-board-cooldowns.json` should be ignored; do not delete it.
- Check ignores with:
  - `git check-ignore -q data/job-board-cooldowns.json && echo yes`
  - `git check-ignore -q NotchPrompter/.build/.lock && echo yes`

## Hardcoded path cleanup

- Tracked scripts/docs should not contain Robin-specific absolute paths like `/Users/robinletim/career-ops`.
- For shell scripts, prefer derived paths:
  - `SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"`
  - `SRC_ROOT="${SRC_ROOT:-$SCRIPT_DIR}"`
- For Node lookup in shell scripts, do not hardcode nvm paths. Use:
  - `NODE_BIN="${NODE_BIN:-$(command -v node || true)}"`
  - fail clearly if empty.
- For docs, use `/path/to/career-ops` or repo-relative paths like `data/applications.md`.
- Validate tracked absolute paths with the same pattern as `test-all.mjs`:
  - `git grep -n "/Users/" -- '*.mjs' '*.sh' '*.md' '*.go' '*.yml' | grep -v README.md | grep -v LICENSE | grep -v CLAUDE.md | grep -v test-all.mjs`

## One-off script repair

If a one-off script is tracked and broken, prefer making it generic instead of adding dependencies:
- `render-screening-responses.mjs` should accept `<input.md> <output.pdf>`.
- Reuse the existing no-extra-dependency Markdown-to-PDF approach from `convert-md-to-pdf.mjs` rather than adding `marked` unless there is a strong reason.
- Validate with `node --check render-screening-responses.mjs` and a usage call that exits cleanly with a clear message.

## Partial scan integration cleanup

When `package.json` points `npm run scan` at an untracked or new wrapper such as `scan-all.mjs`:
1. Inspect `package.json`, `scan-all.mjs`, `providers/`, `scan-job-boards.mjs`, and `modes/scan.md`.
2. If the wrapper is coherent, complete it rather than reverting package.json.
3. Add a non-mutating `--help` / `-h` guard before running scanners. `npm run scan -- --help` must print help and must not touch `data/pipeline.md` or `data/scan-history.tsv`.
4. Syntax-check all scan integration files:
   - `for f in scan-all.mjs providers/*.mjs scan-job-boards.mjs; do node --check "$f"; done`

## Duplicate warning cleanup

Do not delete apparent duplicate tracker rows when there is evidence of reapplication.
A company+role duplicate can be treated as intentional when:
- one row has a closed outcome (`Rejected`, `Discarded`, or `SKIP`), and
- notes mention `new posting`, `different req`, `different requisition`, `reapplication`, or `encouraged to apply`.

In that case, update duplicate detection to print an OK/intentional-reapplication line rather than warning, preserving both row numbers for auditability.

## Go dashboard build behavior

Do not auto-install Go during cleanup. If Go is not installed, `test-all.mjs` should emit a clear warning/skip for the Go dashboard build rather than failing the entire suite with `go: command not found`.
Use a quiet availability check such as:
- `command -v go >/dev/null 2>&1 && go version`

If Go is installed but `go build` fails, that remains a real failure.

## Safe staging and commit after cleanup

When Robin asks to commit a completed cleanup:
1. Start with `git status --short` and `git diff --stat`.
2. Inspect any questionable tracked file before staging, especially files that sound adjacent but not obviously part of cleanup (for example dashboard restart commands). Include only if the diff is clearly intentional and workflow-related.
3. Never use `git add .` for Career-Ops cleanup commits. Stage an explicit allowlist of intended files.
4. After staging, show and verify:
   - `git diff --cached --name-status`
   - `git diff --cached --stat`
   - `git status --short`
5. Confirm the staged list does not include runtime/user data or unrelated projects:
   - `NotchPrompter/`
   - `data/job-board-cooldowns.json`
   - `data/kanban-*`
   - `data/applications.md`
   - `.env`, secrets, tokens, credentials, or provider config
6. Run final validation before commit:
   - `node doctor.mjs`
   - `node verify-pipeline.mjs`
   - `node test-all.mjs`
7. Commit only if validation passes and staged files are clean. Do not push unless Robin explicitly asks.
8. Final report should include commit hash, committed files, validation summary, remaining untracked files grouped by type, and whether it is safe to push.

## Validation checklist

Run and summarize:
- `node doctor.mjs`
- `node verify-pipeline.mjs`
- `node --test tests/web-dashboard-lib.test.mjs`
- `node test-all.mjs`
- targeted syntax checks for edited scripts
- `npm run --silent scan -- --help` if scan entrypoints changed

Final report should include files changed, why each change was made, validation summary, remaining warnings, whether safe to commit, and a suggested commit message.
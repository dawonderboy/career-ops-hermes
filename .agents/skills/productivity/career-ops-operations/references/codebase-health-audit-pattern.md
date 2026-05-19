# Career-Ops codebase health audit pattern

Use when Robin asks whether the Career-Ops folder/codebase needs repair, cleanup, or a sanity check. Treat this as an audit first: gather evidence and report prioritized repair candidates before editing.

## Read-only audit sequence

1. Confirm setup and update state:
   - `node update-system.mjs check`
   - required files: `cv.md`, `config/profile.yml`, `modes/_profile.md`, `portals.yml`, `data/applications.md`, `package.json`
   - `git status --short`, current branch, recent commits
2. Inventory scripts and likely surfaces:
   - inspect `package.json` scripts
   - list `.mjs` entrypoints, `providers/`, dashboard files, and untracked top-level files
3. Run non-mutating health checks:
   - `node doctor.mjs`
   - `node verify-pipeline.mjs`
   - `node test-all.mjs`
   - `node tests/web-dashboard-lib.test.mjs` when dashboard/API logic is relevant
4. If `test-all.mjs` reports a generic failure, re-run the underlying command directly to capture the real root cause. Example: dashboard build failures may hide the actual `go build` stderr.
5. Inspect warnings and failures, but classify them carefully:
   - pipeline duplicate warnings may be intentional reapplications; read both tracker rows before recommending deletion
   - absolute path findings usually indicate portability cleanup candidates
   - personal-data warnings may be author attribution/allowlist issues rather than leaks
   - untracked generated build trees are cleanup/gitignore candidates
6. Final report should separate:
   - passed checks
   - real code defects
   - environment/toolchain gaps
   - repo hygiene/portability issues
   - tracker/data warnings that need human judgment

## Pitfalls

- Do not modify user data or tracker rows during an audit unless Robin explicitly asks for repairs.
- Do not treat missing local binaries as durable code defects. Report them as environment/toolchain gaps and, if useful, mention the install/config fix.
- Do not delete suspected duplicate applications blindly; read the row notes first. A rejected older row plus a newer “different req / encouraged reapply” note may be intentional.
- Do not assume `test-all.mjs` output contains enough detail. Re-run failed subcommands directly.
- Do not leave a final answer as only raw test output. Prioritize repair items and explain why each matters.

## Common repair candidates found by this pattern

- `package.json` points at an untracked new entrypoint (partial feature integration); commit the full feature or revert the pointer.
- One-off render scripts hardcode `/Users/robinletim/...` paths and undeclared dependencies; make them argument-driven/generic, add dependencies, or move them out of system code.
- Runtime state such as cooldown JSON files should be gitignored if not intended as system defaults.
- Large build output trees inside the repo should be moved out or ignored (for example nested app `.build/` directories).
- Public/sanitized repo checks may need allowlist updates for legitimate maintainer attribution in translated READMEs or plugin metadata.

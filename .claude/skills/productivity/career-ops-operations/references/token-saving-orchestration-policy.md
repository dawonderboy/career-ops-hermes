# Token-Saving Orchestration Policy

Use this policy for Career-Ops repo work and closely related Hermes sessions.

## Policy

Hermes is the primary orchestrator for Career-Ops repo work. Use Claude Sonnet High (via Hermes delegation or configured coding specialist flow) as the primary execution/reasoning path for repo inspection, code edits, terminal command planning, debugging, validation loops, test failures, and compact final reports.

Do not use ChatGPT for command-by-command repo orchestration. Use ChatGPT only for initial master prompts, final Hermes report review, commit/push safety judgment, high-risk tradeoffs, or recovery when Hermes is blocked or uncertain.

Do not send ChatGPT full command transcripts, full logs, entire files, large diffs, repetitive progress updates, raw test output, secrets, tokens, API keys, or environment dumps. Summarize instead: command run, exit code, key error/result, files changed, validation status, remaining risks, and exact next safe command.

Stop and ask before pushing, force pushing, rewriting git history, deleting tracked files, deleting job/application data, modifying secrets/auth/provider credentials, broad refactors outside the requested task, committing runtime/user data, or committing unrelated untracked projects.

Hermes may proceed autonomously for repo cleanup, script fixes, docs fixes, validation hardening, test runs, non-destructive inspections, and targeted commits after staged diff review.

## Operational checklist

- Use Claude/Hermes for execution loops.
- Keep ChatGPT out of command-by-command orchestration.
- Ask ChatGPT only for final review, high-risk judgment, or blocked-state recovery.
- Summarize logs instead of pasting them.
- Stop before push/destructive actions.

## Reporting shape

Prefer compact summaries:

```text
command: <command or check group>
exit: <code>
result: <key result or error>
files: <changed/staged files if relevant>
validation: <pass/fail/warn>
risks: <remaining risks>
next: <single safe next command, if any>
```

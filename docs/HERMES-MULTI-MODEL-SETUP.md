# Hermes + ChatGPT/Codex + Claude Code Career-Ops Setup

This document describes a public-safe multi-model architecture for running Career-Ops.

- Career-Ops is the job-search workflow repository.
- Hermes Agent is the coordinator with tools, memory, skills, scheduling, and verification.
- ChatGPT/OpenAI Codex can be used as the main Hermes model for orchestration.
- Claude Code/Claude Sonnet can be used as a bounded coding/debugging worker.

No API keys, OAuth files, tokens, private CVs, application trackers, generated resumes, interview prep, or notification topics belong in GitHub.

## Example sanitized routing

```yaml
model:
  provider: openai-codex
  default: gpt-5.5

delegation:
  provider: anthropic
  model: claude-sonnet-4-6
  max_concurrent_children: 3
  max_iterations: 50
```

## Safe to publish

- Source code
- Sanitized demo data
- Placeholder templates
- Example config files
- Setup documentation

## Keep private

- `cv.md`
- `config/profile.yml`
- `modes/_profile.md`
- `portals.yml`
- `data/*`
- `reports/*`
- `output/*`
- `interview-prep/*`
- `.env`
- OAuth and provider credential files

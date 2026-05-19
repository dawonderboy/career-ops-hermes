# Parser Migration & Recovery — Anthropic API ↔ Codex CLI

Destructive recovery warning: this reference includes historical git reset/checkout recovery commands. Do not run them during routine email-ingest troubleshooting. Use this only when Robin explicitly asks to recover/revert a parser migration and after checking `git status --short`, preserving uncommitted work, and confirming scope.

## Scenario: Dashboard improvements arrived with wrong parser choice

**Date:** May 4, 2026  
**Incident:** Commits f04ac38–1edb57d added dashboard PWA, interview metadata, modes (offer/contact/es), and tests, but also migrated email-ingest.mjs from Anthropic API to Codex CLI. User wants Anthropic back.

**Root cause:** Parser choice got bundled into a multi-commit feature series. Reverting all commits loses the good improvements.

**Solution:** Surgical git recovery — reset to pre-migration baseline, then selectively restore each improvement while excluding the parser migration.

## Step-by-step recovery (May 4, 2026 session)

### 1. Identify the migration commit range

```bash
cd /Users/robinletim/career-ops
git log --oneline -10
# Output (example):
# 1edb57d feat: add Claude Code custom commands for Career-Ops
# 9a0fccd chore: update config, templates, and automation wrapper
# 5b7bf01 test: add comprehensive test suites for new modules
# f04ac38 feat: add offer evaluation and contact modes + Spanish translations
# c3942a8 feat: migrate email parser to Codex CLI + modularize dashboard logic  ← BAD
# 840131b chore: auto-update system files to v1.6.0  ← GOOD (pre-migration)
```

The migration commit is `c3942a8` (email parser to Codex). The safe baseline is `840131b`.

### 2. Reset hard to pre-migration state

STOP: Ask for explicit approval before `git reset --hard`; it can discard uncommitted app/dashboard changes.

```bash
git reset --hard 840131b
git status  # should show clean working directory
```

All commits after 840131b are discarded (including the Codex migration and everything stacked on top).

### 3. Selectively restore improvements from commits after 840131b

The improvements came in this order:
- `c3942a8` — dashboard expansion + web-dashboard-lib (KEEP) + Codex migration (SKIP)
- `f04ac38` — offer/contact modes + Spanish (KEEP)
- `5b7bf01` — test suites (KEEP)
- `9a0fccd` — wrapper scripts + CV template (KEEP)
- `1edb57d` — Claude Code commands (KEEP)

Restore them in a filtered way:

**From c3942a8 (keep dashboard, skip Codex):**
```bash
git checkout c3942a8 -- web-dashboard.mjs web-dashboard-lib.mjs
# Verify this commit has both files (even if Codex migration happened in same commit)
git show c3942a8:email-ingest.mjs | head -50 | grep -c "callCodex"  # should be > 0
# Don't checkout email-ingest.mjs — leave it at HEAD (840131b) which uses Anthropic
```

**From f04ac38 (keep modes):**
```bash
git checkout f04ac38 -- modes/
# Verify the new modes exist:
git show f04ac38:modes/offer.md | head -10
```

**From 5b7bf01 (keep tests but not email-ingest-lib tests):**
```bash
git checkout 5b7bf01 -- tests/career-ops-automation.test.sh
# Skip tests/email-ingest-lib.test.mjs — it tests the Codex parser
```

**From 9a0fccd (keep wrapper & automation):**
```bash
git checkout 9a0fccd -- career-ops-automation.sh scan-with-notify.sh ingest-email.sh watchers/midjourney-careers.mjs templates/cv-template.html
```

**From 1edb57d (keep Claude Code commands):**
```bash
git checkout 1edb57d -- .claude/commands/
```

### 4. Verify parser is correct (Anthropic, not Codex)

```bash
# email-ingest.mjs should still be at HEAD (840131b), using Anthropic
head -100 email-ingest.mjs | grep -A3 "ANTHROPIC_API_KEY"
# Output should show:
# const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
# const ANTHROPIC_MODEL = ...
# const ANTHROPIC_TIMEOUT_MS = ...

# Negative check — should NOT find Codex:
grep -n "callCodex\|CODEX_API_KEY" email-ingest.mjs
# Output should be empty
```

### 5. Commit the restored state

```bash
git status --short
# Output should show modified/added files from all the selective checkouts, NO email-ingest.mjs

git add web-dashboard.mjs web-dashboard-lib.mjs modes/ tests/ career-ops-automation.sh scan-with-notify.sh ingest-email.sh watchers/midjourney-careers.mjs templates/cv-template.html .claude/commands/

git commit -m "feat: restore dashboard/modes/tests/automation improvements with Anthropic API parser

- Dashboard PWA icon generator, --host 0.0.0.0, /api/pipeline endpoint
- Interview metadata extraction and parsing
- Offer/Contact modes + Spanish translations
- Automation wrapper & scan-with-notify improvements
- Claude Code integration commands
- Parser: kept on Anthropic API (reverted Codex migration)"
```

### 6. Verify git history

```bash
git log --oneline -3
# Should show one new commit with all recovered improvements

git diff 840131b -- email-ingest.mjs
# Should be empty (email-ingest unchanged from pre-migration baseline)

git diff 840131b -- web-dashboard.mjs
# Should show large diff (dashboard improvements from c3942a8)
```

## Credential setup after parser restoration

When email-ingest.mjs is restored to **Anthropic API**, it requires `ANTHROPIC_API_KEY`:

```bash
# Check current shell state without printing the key
[ -n "$ANTHROPIC_API_KEY" ] && echo "ANTHROPIC_API_KEY present in shell" || echo "ANTHROPIC_API_KEY not set in shell"

# Check .env without printing secrets
python3 - <<'PY'
from pathlib import Path
p=Path('/Users/robinletim/career-ops/.env')
for name in ('NTFY_TOPIC','ANTHROPIC_API_KEY'):
    val=None
    for line in p.read_text().splitlines() if p.exists() else []:
        if line.startswith(name+'='):
            val=line.split('=',1)[1].strip()
    print(f'{name} present: {bool(val)}, length: {len(val or "")}')
PY
```

If `ANTHROPIC_API_KEY` is missing, email-ingest will fail at startup:
```
[email-ingest] FATAL: ANTHROPIC_API_KEY env var is not set.
  Get a key from https://console.anthropic.com/settings/keys
  Then: export ANTHROPIC_API_KEY=***
```

**Setup:**
1. Get an API key from https://console.anthropic.com/settings/keys (or use existing key)
2. Add `ANTHROPIC_API_KEY` to `.env` using a secure editor. Do not print or paste the full key into terminal output or chat transcripts.
3. Verify `.env` without printing the key:
   ```bash
   python3 - <<'PY'
from pathlib import Path
p=Path('/Users/robinletim/career-ops/.env')
found=False
for line in p.read_text().splitlines() if p.exists() else []:
    if line.startswith('ANTHROPIC_API_KEY='):
        v=line.split('=',1)[1].strip()
        print(f'ANTHROPIC_API_KEY present: {bool(v)}, length: {len(v)}')
        found=True
print('ANTHROPIC_API_KEY present: False, length: 0' if not found else '')
PY
   ```
4. Do NOT commit `.env` with real keys; add to `.gitignore`:
   ```bash
   echo ".env" >> /Users/robinletim/career-ops/.gitignore
   ```
5. Restart email-ingest:
   ```bash
   ./career-ops-automation.sh restart-email
   ./career-ops-automation.sh status
   ```

If restart still fails:
```bash
tail -40 logs/email-ingest.out
# Look for FATAL / error lines about ANTHROPIC_API_KEY or fetch/network errors
```

## Comparison: Anthropic API vs Codex CLI

| Aspect | Anthropic API | Codex CLI |
|--------|---------------|-----------|
| **Auth** | env var `ANTHROPIC_API_KEY` or API key config | CLI auth state (`~/.codex/`) or env var |
| **Startup check** | reads env in email-ingest.mjs | reads from CLI auth cache |
| **Cost** | pay-per-request, token-based | included in CLI subscription/plan |
| **Latency** | ~100–500ms per parse | ~200–800ms (CLI overhead) |
| **Function call** | `await callClaude(userPrompt)` | `await execCodex(userPrompt)` |
| **Parser module** | inline in email-ingest.mjs | separate email-ingest-lib.mjs |
| **Resume after crash** | needs ANTHROPIC_API_KEY in env | needs codex auth state stable |

## Lessons learned

1. **Parser choice should be isolated:** if a migration happens, make it a single-purpose commit so rollback doesn't lose unrelated improvements.
2. **Selective git recovery is better than all-or-nothing revert:** `git reset + git checkout <commit> -- <files>` lets you keep good changes while swapping out one bad decision.
3. **Test the parser early after migration:** after checkout/commit, verify with `grep callClaude` or `grep callCodex` BEFORE restarting the process.
4. **Credential setup is workflow-critical:** a working parser with missing auth is a silent startup failure. Check logs immediately after restart.
5. **Don't .gitignore credentials after the fact:** if `.env` with real keys was already committed, force-rewrite history or rotate the key. In this case, `.env` was small and pre-existed, so no commit leak happened.

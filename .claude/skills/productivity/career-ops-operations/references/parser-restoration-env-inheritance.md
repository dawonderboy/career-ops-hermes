# Parser Restoration: Selective Git Recovery & Environment Variable Inheritance

Destructive recovery warning: this reference includes historical git reset/checkout recovery commands. Do not run them during routine email-ingest troubleshooting. Use this only when Robin explicitly asks to recover/revert a parser migration and after checking `git status --short`, preserving uncommitted work, and confirming scope.

## Problem Statement
When a parser migration (e.g., Anthropic API → Codex CLI) ships alongside unrelated improvements (dashboard enhancements, modes, tests), and the new parser proves to be the wrong choice, simply reverting all commits throws away good work. Additionally, environment variables loaded via `.env` sourcing in shell scripts don't automatically inherit to child processes started with `nohup` unless explicitly exported.

## Selective Git Recovery Pattern

### Use Case
- Migration commit: `c3942a8 feat: migrate email parser to Codex CLI + dashboard improvements`
- Pre-migration baseline: `840131b chore: auto-update system files v1.6.0`
- Decision: Keep dashboard, modes, tests; restore original parser (Anthropic API)

### Workflow

**1. Reset to pre-migration state (destructive):**

STOP: Ask for explicit approval before `git reset --hard`; it can discard uncommitted app/dashboard changes.

```bash
git reset --hard 840131b
```
This wipes all working changes and all commits after `840131b`. The repository is now clean but the parser is back to the old baseline.

**2. Selectively restore improvements from the bad commit:**
```bash
# Dashboard + helper library (wanted)
git checkout c3942a8 -- web-dashboard.mjs web-dashboard-lib.mjs

# Modes (independent of parser)
git checkout f04ac38 -- modes/

# Tests for automation/dashboard (wanted)
git checkout 5b7bf01 -- tests/career-ops-automation.test.sh tests/web-dashboard-lib.test.mjs

# Wrapper scripts (independent of parser)
git checkout 9a0fccd -- career-ops-automation.sh scan-with-notify.sh ingest-email.sh

# Skip email-ingest.mjs, email-ingest-lib.mjs — these remain at HEAD
```

**3. Verify the parser is correct:**
```bash
grep -n "callClaude\|callCodex" email-ingest.mjs | head -5
# Expected: callClaude → Anthropic API (correct)
# Wrong: callCodex → Codex CLI (revert this)

head -50 email-ingest.mjs | grep -A3 "ANTHROPIC_API_KEY\|CODEX"
# Check which credentials/environment variables are referenced
```

**4. Stage restored files:**
```bash
git status --short
git add web-dashboard.mjs web-dashboard-lib.mjs modes/ tests/ career-ops-automation.sh ...
git commit -m "feat: restore dashboard/modes/tests improvements (Anthropic API parser)"
```

**5. Verify final state:**
```bash
git log --oneline -3
git status --short  # should be clean
```

### Critical Pitfall: Lost Work
When you run `git reset --hard`, **ALL uncommitted changes** (staged and unstaged) are discarded permanently. If you have improvements not yet committed:

```bash
git stash       # save uncommitted work
git reset --hard <commit>
git checkout <other-commit> -- <files>
# ... verify and commit new state ...
git stash pop   # restore the stashed changes if needed
```

---

## Environment Variable Inheritance Pitfall in `nohup`

### Problem
A shell script sources `.env` to populate environment variables:
```bash
set -a
source .env
set +a
```

But when the script then starts a background process with `nohup`, those variables don't inherit to the child process:

```bash
nohup "$NODE_BIN" email-ingest.mjs >> "$LOG_FILE" 2>&1 &
# email-ingest.mjs starts but ANTHROPIC_API_KEY is NOT in its environment
```

The child process exits with `FATAL: ANTHROPIC_API_KEY env var is not set`, even though the parent shell had already sourced `.env`.

### Root Cause
`nohup` spawns a new process with a fresh environment. Shell variables sourced in the parent are **local to that shell session** unless explicitly exported. The `set -a` / `set +a` pattern sources variables and marks them for export, but the export scope applies only to that shell session's child processes — not to subshells spawned later via `nohup`.

### Solution
Explicitly `export` variables **before** calling `nohup`:

```bash
# Load .env
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

# Explicitly export before nohup
export NTFY_TOPIC ANTHROPIC_API_KEY
nohup "$NODE_BIN" email-ingest.mjs >> "$LOG_FILE" 2>&1 &
```

The `export` statement makes those variables part of the shell's exported environment, which is inherited by all child processes, including those started with `nohup`.

### Test Pattern
After restarting the watcher:
```bash
# Check that the process has the env var without printing it
PID_FILE=/tmp/career-ops-email-ingest.pid
if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  ps eww -p "$PID" | grep -q 'ANTHROPIC_API_KEY=' \
    && echo 'ANTHROPIC_API_KEY present in process env' \
    || echo 'ANTHROPIC_API_KEY missing from process env'
else
  echo "PID file missing: $PID_FILE"
fi

# Or send a test message and verify it was parsed
# (parsing requires the API key, so successful parse = env was inherited)
tail -20 logs/email-ingest.out | grep -E "updated|parse_error"
```

---

## Credential Discovery After Parser Swap

### Anthropic API
Check if credentials exist:
```bash
[ -n "$ANTHROPIC_API_KEY" ] && echo "ANTHROPIC_API_KEY present in shell" || echo "ANTHROPIC_API_KEY not set in shell"
python3 - <<'PY'
from pathlib import Path
for path in [Path('/Users/robinletim/career-ops/.env'), Path.home()/'.anthropic_api_key']:
    if not path.exists():
        print(f'{path}: missing')
        continue
    text=path.read_text()
    if path.name == '.env':
        vals=[line.split('=',1)[1].strip() for line in text.splitlines() if line.startswith('ANTHROPIC_API_KEY=')]
        v=vals[0] if vals else ''
    else:
        v=text.strip()
    print(f'{path}: ANTHROPIC_API_KEY present: {bool(v)}, length: {len(v)}')
PY
```

If missing, get a key from https://console.anthropic.com/settings/keys and add it to `/Users/robinletim/career-ops/.env` using a secure editor. Do not print or paste the full key into terminal output or chat transcripts.

### Codex CLI
Check if credentials exist:
```bash
ls -la ~/.codex/
codex auth status
```

Both parsers should be tested before committing: send a test email to the ntfy topic and verify it appears in `data/email-ingest.log` within 5 seconds.

---

## Session Example: May 4, 2026

**Commits involved:**
- `c3942a8` — Codex migration (wrong parser, but good improvements)
- `f04ac38` — Offer/contact modes + Spanish
- `5b7bf01` — Test suite
- `9a0fccd` — Wrapper script updates
- `1edb57d` — Custom Claude Code commands

**Recovery steps:**
1. Reset to `840131b` (pre-migration baseline)
2. Restore commits `c3942a8`, `f04ac38`, `5b7bf01`, `9a0fccd`, `1edb57d` selectively (dashboard, modes, tests, wrapper)
3. Verify `email-ingest.mjs` still has `callClaude` (Anthropic API) — no restoration needed
4. Fix `ingest-email.sh` to explicitly export `ANTHROPIC_API_KEY` before `nohup`
5. Add ANTHROPIC_API_KEY to `.env`
6. Restart email-ingest and verify with test email

**Result:**
- Commit `41aac10`: Dashboard + modes + tests restored
- Commit `5798f02`: Environment variable export fix
- Parser: Anthropic API (restored from pre-migration)
- Token cost: ~$0.17/month at current volume

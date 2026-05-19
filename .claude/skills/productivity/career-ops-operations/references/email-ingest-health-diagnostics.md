# Email Ingest Health Diagnostics

When Robin reports emails aren't reflecting in the tracker, use this **multi-layer diagnostic sequence** to identify whether the problem is:
- Email never reached ntfy (upstream issue, forwarding misconfigured)
- Email reached ntfy but watcher crashed/stalled (parser issue, missing API key)
- Email parsed but couldn't match to tracker (no matching company, malformed sender)

## Quick Status Check

```bash
./career-ops-automation.sh status
```

Key indicators:
- `Running: yes/no` — Is the watcher process alive?
- `PID: XXXXX` — Process ID (compare to previous to detect crashes/restarts). A live PID alone does not prove health.
- `Last tracker update: 2026-05-04T20:32:44Z` — Freshness (>1h old = stalled). ntfy silence or quiet logs do not prove health; use a known event/backlog check plus tracker/dashboard reflection.
- `Review queue: N item(s)` — Unresolvable items waiting for manual triage
- `Codex CLI: codex-cli 0.125.0` — Parser identity
- `Codex auth file: present` — Auth available (but doesn't confirm it works)

## Layer 1: Wrapper/Parser Startup Errors

```bash
./career-ops-automation.sh logs email 80
```

Look for:
- `FATAL: ANTHROPIC_API_KEY env var is not set` — Parser can't initialize; API key missing from environment (even if in `.env`, not being sourced correctly)
- `Codex CLI exited null: no stderr` — Parser crashed silently (no error message)
- `subscribing to https://ntfy.sh/...` — Successful subscription to ntfy stream

**Fix for ANTHROPIC_API_KEY error:**
- Verify `.env` contains a key without printing the secret:
  ```bash
  python3 - <<'PY'
from pathlib import Path
p=Path('.env')
found=False
for line in p.read_text().splitlines() if p.exists() else []:
    if line.startswith('ANTHROPIC_API_KEY='):
        v=line.split('=',1)[1].strip()
        print(f'ANTHROPIC_API_KEY present: {bool(v)}, length: {len(v)}')
        found=True
print('ANTHROPIC_API_KEY present: False, length: 0' if not found else '')
PY
  ```
- Restart the watcher: `./career-ops-automation.sh restart-email`
- If wrapper's `replay_email()` function is missing `source .env`, add it:
  ```bash
  replay_email() {
    local since="${1:-24h}"
    set -a && source .env && set +a  # <- Add this line
    node email-ingest.mjs --replay "$since"
  }
  ```

## Layer 2: Check ntfy Backlog (Upstream Confirmation)

Verify emails actually arrived at ntfy, independent of the watcher:

```bash
python3 - <<'PY'
import json, urllib.request
url='https://ntfy.sh/robin-career-ops-a7f3b9k2/json?poll=1&since=4h'
with urllib.request.urlopen(url, timeout=30) as r:
    lines=[line.decode('utf-8','replace').strip() for line in r if line.strip()]
print(f'Events in last 4h: {len(lines)}')
for raw in lines[-20:]:
    obj=json.loads(raw)
    ts=obj.get('time','?')
    title=(obj.get('title') or '')[:80]
    msg=(obj.get('message') or '')[:150]
    print(f'{ts} | {title} | {msg}')
PY
```

**Interpretation:**
- Emails present here = ntfy received them ✓ (don't blame forwarding)
- Emails NOT here = check if they're going to the right `robin-career-ops-a7f3b9k2@ntfy.sh` address
- Emails present but not in `data/email-ingest.log` = watcher consumed them but parser failed or stalled

## Layer 3: Review Queue (Parse Failures)

Items that can't auto-apply land here:

```bash
tail -150 data/email-ingest-review.md | grep -E "^## .*(Parser error|No tracker match)" | head -20
```

Common reasons:
- **No tracker match** — Company name in email doesn't match any tracker entry (e.g., "Archer Recruiting" sent email but tracker has "Archer Aviation")
- **Parser error** — Codex CLI crashed or returned invalid JSON
- **Ignore** — Email was filtered as marketing/notification, not a job response

**Resolution:**
- For "No tracker match" entries: ignore if not real job-related, or manually find/create the company in the tracker
- For "Parser error" entries: check if the parser is running (Layer 1); if it is, the email format may be unusual (mixed headers, garbled encoding, etc.)

## Layer 4: Replay Recent Backlog

Replay safety guard:
- Replay only a bounded window that contains the missing messages.
- Before replay, snapshot affected tracker rows and latest ingest logs.
- Check `data/email-ingest-review.md` for existing parser/no-match entries.
- Do not replay repeatedly if tracker notes already changed.
- After replay, inspect affected rows for duplicate `Interview:` / `Interview update` prefixes.

If emails are in ntfy but not in local logs, replay the smallest recent window that contains the missing messages:

```bash
./career-ops-automation.sh replay-email 4h
# Then immediately inspect affected tracker rows and logs before replaying again.
```

Output shows `updated #XXX` lines for each tracker change. Example:
```
[2026-05-04T20:32:37.455Z] updated #179 GEICO: Interview → Interview — Interview scheduled...
[email-ingest] replay done — 7 messages processed
```

This is a one-shot parse; it does not require the live watcher to be running. It is a recovery action, not a health check. Do not replay repeatedly without inspecting tracker note changes.

## Layer 5: Restart Watcher (If Stale)

If replay succeeded but `Last tracker update` is still old, restart the live watcher:

```bash
./career-ops-automation.sh restart-email
sleep 2
./career-ops-automation.sh status
```

Confirm:
- New PID (different from old one)
- `Running: yes`
- Recent `subscribing to https://...` log lines

## Known Issues & Fixes

### ANTHROPIC_API_KEY Missing in replay-email()

**Symptom:** `./career-ops-automation.sh replay-email 4h` returns `FATAL: ANTHROPIC_API_KEY env var is not set`

**Root cause:** `replay_email()` function in `career-ops-automation.sh` doesn't source `.env` before invoking Node

**Fix:** Add `set -a && source .env && set +a` inside `replay_email()` before the Node invocation (already applied as of May 4, 2026 session)

### Codex CLI Silent Exit (null/no stderr)

**Symptom:** Log shows `Codex CLI exited null: no stderr` for a specific email; that email lands in review queue

**Root cause:** Email format is unusual (mixed headers, encoding issue, oversized attachment) and Codex crashes instead of gracefully failing

**Recovery:** Check `data/email-ingest-review.md` for the entry. If the parsed metadata (company, event, role) is visible despite the crash, manually apply it to the tracker. Otherwise, ignore if non-critical.

### Watcher Stalled (PID Exists But No Recent Updates)

**Symptom:** `status` shows `Running: yes` and a recent PID, but `Last tracker update` is 2+ hours old, and new emails in ntfy aren't being processed

**Root cause:** ntfy connection silently dropped or watcher is idle-waiting forever (watchdog timeout needed)

**Recovery:**
1. Snapshot affected tracker rows/logs.
2. Replay a bounded backlog: `./career-ops-automation.sh replay-email 4h`.
3. Inspect affected rows for duplicate or stale `Interview:` / `Interview update` notes.
4. Restart: `./career-ops-automation.sh restart-email`.
5. Verify new PID, fresh log lines, tracker changes, and dashboard/API reflection: `./career-ops-automation.sh status` and `./career-ops-automation.sh verify`.

### Test Emails / No Tracker Match

**Symptom:** Review queue shows `Acme Corp (Interview)` with `No tracker match` but you didn't send test emails

**Cause:** Someone forwarded test emails to the Career-Ops group, or a forwarding rule picked up a non-job email

**Resolution:** These are harmless. Leave them in the review queue or manually add the company to the tracker if it's a real application. Use `grep "^- \[ \] Acme" data/pipeline.md` to check if it's tracked; if not, either ignore or add it.

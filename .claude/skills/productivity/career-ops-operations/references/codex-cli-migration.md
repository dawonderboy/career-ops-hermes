# Codex CLI Email-Parser Migration

Legacy/historical note: this documents an older Codex CLI email-parser migration. Current Career-Ops email ingest may use Anthropic API again. Do not use this as current setup guidance unless `email-ingest.mjs` and `./career-ops-automation.sh status` confirm `Parser: Codex CLI`.

**Context:** Anthropic free-tier OAuth was discontinued 2026-04-15. Career-Ops migrated from direct Anthropic API calls to Codex CLI subprocess for email parsing.

## Migration Pattern

### Before (2026-04-27 and earlier)
```javascript
// email-ingest.mjs: Direct API call to Anthropic
import fetch from node:fetch;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

async function callClaude(userPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 512,
      system: PARSE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  const json = await res.json();
  return json.content[0].text;
}
```

**Problem:** API key required in env var; free tier discontinued, 401 errors post-2026-04-15.

### After (2026-04-28+)
```javascript
// email-ingest.mjs: Spawn Codex CLI subprocess
import { spawn } from 'node:child_process';
const CODEX_BIN = process.env.CODEX_BIN || 'codex';
const CODEX_MODEL = process.env.CODEX_MODEL || ''; // optional override

async function callCodex(userPrompt) {
  const outDir = mkdtempSync(join(tmpdir(), 'career-ops-codex-'));
  const schemaPath = join(outDir, 'schema.json');
  const outPath = join(outDir, 'last-message.txt');
  
  // Write JSON schema for structured output
  writeFileSync(schemaPath, JSON.stringify({
    type: 'object',
    properties: {
      company: { type: ['string', 'null'] },
      event: { type: 'string', enum: ['Applied', 'Interview', 'Offer', 'Rejected', ...] },
      role: { type: ['string', 'null'] },
      datetime: { type: ['string', 'null'] },
      interviewer: { type: ['string', 'null'] },
      summary: { type: 'string' },
    },
  }));
  
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--ignore-rules',
    '--ephemeral',
    '--sandbox', 'read-only',
    '--output-schema', schemaPath,
    '-o', outPath,
  ];
  if (CODEX_MODEL) args.push('-m', CODEX_MODEL);
  args.push('-');
  
  // Spawn as subprocess
  const proc = spawn(CODEX_BIN, args, {
    cwd: outDir,
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  
  // Write prompt to stdin
  proc.stdin.write(`${PARSE_SYSTEM_PROMPT}\n\n${userPrompt}`);
  proc.stdin.end();
  
  // Wait for output file
  return new Promise((resolve, reject) => {
    proc.on('exit', (code) => {
      if (code === 0 && existsSync(outPath)) {
        const json = JSON.parse(readFileSync(outPath, 'utf-8'));
        resolve(json);
      } else {
        reject(new Error(`Codex exit ${code}`));
      }
    });
  });
}
```

**Benefits:**
- Auth source must be verified from the installed Codex CLI and current Hermes/Career-Ops setup; do not assume a Claude credentials path.
- Structured JSON output with schema validation
- Subprocess model is isolated and testable
- Can override model via env var
- Better error handling (exit codes, stderr capture)

## Configuration

**Environment variables** (in `.env` or `~/.env.career-ops`):
```bash
CODEX_BIN=codex                          # Path to codex CLI
CODEX_MODEL=claude-3-5-sonnet            # Optional model override
NTFY_TOPIC=robin-career-ops-a7f3b9k2    # ntfy topic for email forwarding
NTFY_IDLE_TIMEOUT_MS=300000              # Watchdog timeout (5 minutes)
```

**Codex CLI requirements:**
- Must be installed: `npm install -g @qwen-code/qwen-code` or similar
- Must be authenticated according to the installed Codex CLI; verify with the current `codex auth status` or equivalent command, not a hardcoded credentials path.
- Must support `--output-schema` flag (added 2026-04)

## Datetime Fallback

When Codex returns `datetime: null` from the email body, `email-ingest.mjs` imports `extractInterviewDatetimeFallback()` from `email-ingest-lib.mjs`:

```javascript
import { extractInterviewDatetimeFallback } from './email-ingest-lib.mjs';

// After Codex parse
if (!parsed.datetime) {
  parsed.datetime = extractInterviewDatetimeFallback(emailText);
}
```

This fallback handles:
1. **Calendar header patterns:** `"April 24\n10:00 AM - 10:30 AM GMT-07:00"`
2. **Textual dates:** `"on April 24, 2026 at 10:00am PT"`
3. **ICS `DTSTART`:** `DTSTART;TZID=America/Los_Angeles:20260424T100000`

Returns normalized `"YYYY-MM-DD HH:MMam/pm TZ"` or `null`.

## Verification

**Check parser is working:**
```bash
./career-ops-automation.sh status
# Should show:
#   Parser: Codex CLI
#   Codex CLI: codex-cli 0.125.0 (or similar version)
#   Codex auth file: present
#   NTFY_TOPIC: robin-career-ops-a7f3b9k2
```

**Send test email:**
```bash
curl -d "Subject: Test Interview Confirmation
From: test@example.com
Date: May 4, 2026 at 2:00pm PDT
Zoom: https://zoom.us/j/123456789" \
  https://ntfy.sh/robin-career-ops-a7f3b9k2
```

**Check parse in logs:**
```bash
tail -10 data/email-ingest.log
# Should show recent entry with parsed company, event, datetime
```

## Known Issues & Workarounds

### Issue: `Codex CLI exited null: no stderr`
**Symptom:** Entry appears in `data/email-ingest-review.md` with `parse_error`.
**Cause:** Codex subprocess exited with code 0 but produced no output file.
**Workaround:** Ensure `--output-schema` path is writable; check `outDir` temp directory is not full.

### Issue: `datetime: null` but email has clear date
**Symptom:** Parser returns `datetime: null` even when email body says "May 4 at 2pm".
**Cause:** Codex may not extract textual dates reliably; fallback handles this.
**Workaround:** `email-ingest-lib.mjs` fallback attempts 3 strategies; if still null, entry lands in review queue for manual processing.

### Issue: Interview date lost in ntfy transport
**Symptom:** Email has ICS attachment, but ntfy received only plain text.
**Cause:** ntfy email-to-publish strips attachments (lossy transport).
**Workaround:** Fallback parses calendar headers and textual dates from email body. For reliable calendar parsing, recommend direct IMAP access instead of ntfy forwarding (future improvement).

## Testing

**Unit tests for datetime fallback:**
```bash
node --test tests/email-ingest-lib.test.mjs
# Tests:
#   - parseCalendarHeaderDate recognizes "April 24\n10:00 AM - 10:30 AM GMT-07:00"
#   - parseTextualDate extracts "on April 24, 2026 at 10:00am PT"
#   - parseIcsDate reads DTSTART from ICS content
#   - extractInterviewDatetimeFallback returns null for scheduling links (no booked slot yet)
```

**Integration test:**
```bash
# Send real email to ntfy topic
curl -d "Subject: Interview Confirmed
Date: May 4, 2026 at 3:00pm PT
Zoom: https://zoom.us/j/123" \
  https://ntfy.sh/robin-career-ops-a7f3b9k2

# Wait 5 seconds, check parse
tail -3 data/email-ingest.log | grep "May 4.*3:00pm"
# Should show parsed datetime and Zoom URL
```

## Migration Checklist (for Future Updates)

- [ ] Codex CLI installed globally or via nvm
- [ ] Codex authenticated: `codex auth` works
- [ ] `.env` or environment has `CODEX_BIN` set correctly
- [ ] `email-ingest.mjs` imports `email-ingest-lib.mjs`
- [ ] `email-ingest-lib.mjs` exports `extractInterviewDatetimeFallback()`
- [ ] All tests pass: `node --test tests/email-ingest-lib.test.mjs`
- [ ] Automation wrapper reports `Parser: Codex CLI` + version
- [ ] Test email parses without `parse_error`

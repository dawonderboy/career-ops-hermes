# Tracker Sync & Dashboard Pitfalls (May 2026 Session)

## Tracker Row Pipe Syntax Breaks Both Dashboards (CRITICAL)

**Historical problem:** Older workflows added new tracker rows via `mcp_Patch`, which is no longer allowed for net-new tracker entries. The remaining current risk is malformed row prefixes when modifying existing tracker rows.

Current tracker write contract:

Net-new tracker entries must not be written directly to `data/applications.md`.

For brand-new roles:

1. Create TSV additions under `batch/tracker-additions/`.
2. Run `node merge-tracker.mjs`.
3. Run `node verify-pipeline.mjs`.

Direct edits to `data/applications.md` are allowed only for updating existing rows/status/notes when an explicit workflow permits it.

Adding brand-new roles directly to `data/applications.md` is forbidden, even for small batches.

**Root cause:** Both `web-dashboard.mjs` and `web-dashboard.react.mjs` skip tracker rows that do not start with a single pipe plus space:

```javascript
if (!line.startsWith('| ')) continue;  // Single pipe + space
```

Rows with `||` fail this check and are skipped by the parser, even though the Markdown can look visually acceptable.

**Symptom:**
- Tracker file contains the row when inspected directly.
- Dashboard UI loads normally.
- Affected entries do not appear in dashboard API/UI.
- No error message is shown.

**Historical session example (May 6, 2026):**
- Netflix #270 and CoreWeave #269 were added using an obsolete direct-row pattern.
- Rows started with `||` because of patch context drift.
- Both dashboards rejected the rows.
- The repair was changing `||` to `| ` in the existing malformed rows.

**Prevention:**
1. For net-new tracker entries, use TSV additions plus `node merge-tracker.mjs`.
2. For existing-row edits, ensure every data row starts with single pipe + space (`| `), never `||`.
3. After edits, run verification before closing the task.

**Verification after permitted tracker edits:**

```bash
node verify-pipeline.mjs

grep "^| " data/applications.md | grep "<company>"

curl -s http://127.0.0.1:3737/api/state | jq '.apps | map(select(.company == "<company>")) | length'
```

If React dashboard sync is also in scope, check its API separately using the currently configured scheme/port.

**Fix if you discover double-pipe rows:**
1. Identify affected rows with `grep "^|| " data/applications.md`.
2. Replace only the malformed existing row prefix with `| ` using enough context to avoid accidental replacement.
3. Run `node verify-pipeline.mjs`.
4. Query the dashboard API.
5. Restart the relevant dashboard only if tracker/API state is correct but the service/UI remains stale.

---

## React Dashboard Service Setup (May 2026 Session)

**Background:** Career-Ops now runs two dashboards simultaneously:
- **Node.js variant** (port 3737): Original, primary dashboard
- **React variant** (port 3940): Modern component-based UI, separate service

**Setup gotcha:** React dashboard needs its own launchd plist and cannot share the port with Node dashboard.

**Correct configuration:**

```xml
<!-- /Users/robinletim/Library/LaunchAgents/com.robinletim.career-ops.web-dashboard-react.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.robinletim.career-ops.web-dashboard-react</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/robinletim/.local/bin/node</string>
    <string>/Users/robinletim/career-ops/web-dashboard.react.mjs</string>
    <string>--port</string><string>3940</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/robinletim/career-ops</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key>
  <string>/Users/robinletim/Library/Logs/career-ops/web-dashboard-react.out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/robinletim/Library/Logs/career-ops/web-dashboard-react.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/Users/robinletim/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>NODE_ENV</key><string>production</string>
  </dict>
</dict>
</plist>
```

**Key points:**
- React service must have its own Label (`com.robinletim.career-ops.web-dashboard-react`)
- Port must be 3940 (not 3737, which is taken by Node dashboard)
- Separate StandardOutPath and StandardErrorPath for debugging
- KeepAlive=true ensures auto-restart on crash

**Recovery if React dashboard crashes:**

```bash
# Load service (one-time)
PLIST="/Users/robinletim/Library/LaunchAgents/com.robinletim.career-ops.web-dashboard-react.plist"
LABEL="com.robinletim.career-ops.web-dashboard-react"
USERID=$(id -u)

plutil -lint "$PLIST"  # Verify syntax
launchctl bootstrap "gui/$USERID" "$PLIST"
launchctl enable "gui/$USERID/$LABEL"
launchctl kickstart -k "gui/$USERID/$LABEL"

# Verify it's running
sleep 2
curl -s http://127.0.0.1:3940/api/state | jq '.apps | length'
```

**Common failure modes:**
1. **EADDRINUSE on port 3737** — Plist was configured for React but tried to use Node's port. Update plist to use 3940.
2. **tcsetattr errors (background process only)** — Terminal PTY issues when run in background. Use launchd service, not manual background process.
3. **Silent exit code 137 (SIGKILL)** — Process killed, usually due to resource constraints or terminal issues. Launchd with KeepAlive restarts it automatically.

---

## Summary for Future Sessions

When working with Career-Ops tracker updates:
1. Use `|` (single pipe), never `||` (double pipe) at row start
2. After any tracker edit, verify with `curl http://127.0.0.1:3737/api/state`
3. React dashboard (3940) and Node dashboard (3737) are separate services; check both if sync issues occur
4. If React dashboard crashes, it auto-restarts via launchd KeepAlive, but verify with `curl http://127.0.0.1:3940/api/state`

See `tracker-dashboard-sync-pitfalls.md` (main skill) for diagnosis flowchart.

# React Dashboard Operational Guide — May 2026

## Overview

As of May 6, 2026, Career-Ops runs **two dashboards simultaneously**:
- **Original:** `web-dashboard.mjs` on port 3737 (`http://127.0.0.1:3737`)
- **React variant:** `web-dashboard.react.mjs` on port 3940 (`https://127.0.0.1:3940`)

Both parse the same `data/applications.md` tracker and `/api/state` backend. The React variant serves a modular component UI from `mock/Career Ops Dashboard.html` instead of the original's large inline HTML blob.

## When to Use Each

| Scenario | Use |
|----------|-----|
| Quick check of upcoming interviews | Either; both show calendar + interview progress |
| Full tracker + detailed notes view | Original (3737) — simpler, larger table with full notes |
| Component-based custom UI exploration | React (3940) — prototype new layouts without touching original |
| API/backend testing | Either; both expose `/api/state`, `/api/stream`, `/api/update` |
| Adding a new dashboard feature | Develop in React first; original can adopt proven patterns |

## Starting the React Dashboard

### Via launchd (if configured)

```bash
LABEL="com.robinletim.career-ops.web-dashboard-react"
USERID=$(id -u)
launchctl print "gui/$USERID/$LABEL" | head -10
```

If the service is not configured, create a plist:

```bash
mkdir -p /Users/robinletim/Library/LaunchAgents
cat > /Users/robinletim/Library/LaunchAgents/com.robinletim.career-ops.web-dashboard-react.plist <<'EOF'
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
    <string>--host</string><string>0.0.0.0</string>
    <string>--port</string><string>3940</string>
    <string>--path</string><string>/Users/robinletim/career-ops</string>
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
EOF

PLIST="/Users/robinletim/Library/LaunchAgents/com.robinletim.career-ops.web-dashboard-react.plist"
LABEL="com.robinletim.career-ops.web-dashboard-react"
USERID=$(id -u)
plutil -lint "$PLIST"
launchctl bootstrap "gui/$USERID" "$PLIST"
launchctl kickstart -k "gui/$USERID/$LABEL"
```

### Direct terminal

```bash
cd /Users/robinletim/career-ops
node web-dashboard.react.mjs --host 0.0.0.0 --port 3940 --path .
```

## Accessing the React Dashboard

### Local machine (Mac)

- **Localhost:** `http://127.0.0.1:3940/`
- **Secure (HTTPS):** `https://127.0.0.1:3940/` (self-signed certs, browser warnings)
- **LAN:** `http://<mac-local-ip>:3940/` (if `--host 0.0.0.0`)
- **Tailscale:** `http://100.117.19.94:3940/` (if accessible from the user's Tailscale network)

### Browser TLS warnings

The React dashboard serves HTTPS using auto-generated mkcert certs. Your Mac's browser may show warnings:

```
ERR_CERT_COMMON_NAME_INVALID / Your connection is not private
```

This is expected. The connection is secure but self-signed. Bypass:
- In Chrome: Click "Advanced" → "Proceed to 127.0.0.1 (unsafe)"
- In Safari: Proceed once (it's fine)
- In curl: Use `-k` flag to skip cert verification

## Verifying Health

### Check service status

```bash
ps aux | grep -E '[w]eb-dashboard-react|[n]ode.*react'
```

Expected output: one running process, node binary path, `--port 3940`.

### Check logs

```bash
tail -50 /Users/robinletim/Library/Logs/career-ops/web-dashboard-react.out.log
tail -50 /Users/robinletim/Library/Logs/career-ops/web-dashboard-react.err.log
```

Look for: no `EADDRINUSE` (port conflict), no module load errors, clean startup messages.

### Test API endpoints

```bash
# State API
curl -s -k https://127.0.0.1:3940/api/state | jq '.apps | length'

# Should return a number (count of apps in tracker)

# Pipeline status
curl -s -k https://127.0.0.1:3940/api/pipeline-status | jq '.'

# Should return pipeline state (running, not running, last exit code)
```

### Test browser access

```bash
# Fetch the HTML page
curl -s -k https://127.0.0.1:3940/ | head -20

# Should show HTML, not an error
```

## Known Limitations

1. **Pipeline trigger historical note** — Older versions had a broken "Run pipeline" button in both dashboards. Before treating this as current, check `references/dashboard-button-wrapper-fix.md` and whether `pipeline-run.mjs` / `scan-run.mjs` exist and logs show real execution. See `references/web-dashboard-pipeline-trigger-bug.md` for historical failure context.

2. **Mock data fallback** — If the API is unreachable, the React dashboard falls back to static `mock/data.js`. This can mask real backend problems; always check API health if UI looks stale.

3. **SSE stream timeout** — The `/api/stream` endpoint uses Server-Sent Events (SSE) for live updates. If the browser tab is inactive for >5 minutes, the stream may time out. Refreshing the page reconnects.

4. **No file upload** — Unlike some newer dashboard variants, the React version does not support direct PDF/CV upload. This is intentional; file management stays in the terminal/file system.

## Troubleshooting

### React dashboard not accessible

**Check 1: Is the service running?**
```bash
lsof -nP -iTCP:3940 -sTCP:LISTEN
```

Expected: one process on port 3940. If empty, the service stopped.

**Check 2: Did the service crash?**
```bash
tail -100 /Users/robinletim/Library/Logs/career-ops/web-dashboard-react.err.log | grep -E 'Error|FATAL|ERR_'
```

If you see `EADDRINUSE: address already in use :::3940`, another process is on that port. Use the safer launchd-first ladder:

```bash
lsof -nP -iTCP:3940 -sTCP:LISTEN
launchctl print "gui/$(id -u)/com.robinletim.career-ops.web-dashboard-react" | head -40
launchctl kickstart -k "gui/$(id -u)/com.robinletim.career-ops.web-dashboard-react"
```

Only terminate a process after confirming the PID and command. Prefer normal `kill <PID>` first. Avoid `kill -9` unless normal termination fails and the PID/command are confirmed.

**Check 3: Is the API working?**
```bash
curl -v -k https://127.0.0.1:3940/api/state 2>&1 | head -40
```

If you see `Connection refused`, the service is not listening. Restart it.

### API returns stale data

**Check:** Is `data/applications.md` being updated by other processes?
```bash
stat -f '%Sm' /Users/robinletim/career-ops/data/applications.md
date
```

If the tracker file is old, the issue is not the React dashboard — it's that the tracker isn't being updated. Check email-ingest or pipeline status.

### Calendar not showing interviews

See `references/react-dashboard-live-calendar-data.md` for detailed calendar data flow and debugging.

## Development & Customization

The React dashboard is component-based:

```
mock/
├── Career Ops Dashboard.html   (entry point — loads React/JSX)
├── data.js                     (static fallback data)
├── ui-shell.jsx                (main layout container)
├── calendar-view.jsx           (interview calendar + upcoming)
├── pipeline-view.jsx           (pending items + in-progress)
├── progress-view.jsx           (interview stage progression)
├── scan-queue.jsx              (job discovery queue)
├── drawer.jsx                  (side panel)
└── tweaks-panel.jsx            (theme/settings panel)
```

To modify appearance or add a new view:
1. Edit the relevant `.jsx` file in `mock/`
2. Ensure it imports `window.__live` state or calls `/api/state`
3. Reload the browser (F5)
4. Changes take effect immediately (no rebuild step)

To add a new API endpoint:
1. Add the handler in `web-dashboard.react.mjs` (search for `if (url.pathname ===`)
2. Test with `curl -s -k https://127.0.0.1:3940/api/...`
3. Wire the frontend component to call it
4. Restart the service if you modified `.mjs`

## Related References

- `references/react-dashboard-variant.md` — architecture, data flow, and background
- `references/react-dashboard-live-calendar-data.md` — calendar event extraction and display
- `references/web-dashboard-pipeline-trigger-bug.md` — known issue with pipeline button
- `references/web-dashboard-interview-progression.md` — interview stage emoji and filtering

## Session History

- **May 6, 2026:** React dashboard operational guide documented. Both dashboards running. Calendar link label distinction implemented ("Open in Calendar" vs "Join meeting").

# Tracker–Dashboard Sync Pitfalls

Dashboard routing note:

- Node dashboard: `web-dashboard.mjs`, port `3737`.
- React dashboard: `web-dashboard.react.mjs`, port `3940`.
- Tracker/API data is authoritative upstream.
- Rendered UI is downstream.
- If the user says “dashboard” ambiguously, clarify which UI or check both.
- For sync bugs, verify in this order:
  1. `data/applications.md`
  2. `/api/state` on the relevant dashboard port
  3. browser-rendered UI

## The Problem: Silent Row Rejection

The web-dashboard parser (`web-dashboard.mjs`, line 273) filters rows using:

```javascript
if (!line.startsWith('| ')) continue;
```

This means **data rows MUST start with single pipe + space** (`| `). Rows starting with double pipes (`||`) are silently rejected.

This reference is for repairing existing malformed tracker rows only. It is not approval to create new tracker rows directly.

When you patch a tracker row with `||` at the start instead of `|`, the dashboard appears fully functional—it loads, renders, serves the API—but the affected company simply never appears in the data. There's no error message, no obvious sign of failure. The app looks healthy; the data is just incomplete.

## Session Example: OpenAI Row #14 (May 2026)

**What happened:**
1. I patched the OpenAI tracker row to update it from "Applied" to "Evaluated" with completion notes.
2. The patch resulted in a row starting with `||` instead of `|`.
3. Dashboard continued running, `/api/state` API responded normally, but OpenAI row #14 was absent from the JSON.
4. User asked "are the dashboards still connected to the tracker?" — the answer was "yes, but one row is missing."

**Discovery path:**
- Verified both dashboards (ports 3737, 3940) were running: ✓
- Tested `/api/state` API: ✓ (returned 172 apps, but should be 176)
- Searched API response for OpenAI: ✗ (null)
- Checked tracker for OpenAI: ✓ (row #14 exists, formatted correctly visually, but with `||` at start)
- Checked dashboard parser logic: Found `startsWith('| ')` filter
- Fixed all `||` rows to `|`: ✓
- Restarted dashboard and verified OpenAI reappears: ✓

## Prevention Checklist

When patching `data/applications.md`:

1. **Before and after the patch, verify row format:**
   ```bash
   grep "^| <num>" data/applications.md | head -3
   ```
   Every data row must start with `| ` (single pipe + space), not `||`, not `|` alone.

2. **After any batch tracker update, run verification:**
   ```bash
   node verify-pipeline.mjs
   ```
   Do not rely on `verify-pipeline.mjs` alone for dashboard visibility. Also grep the affected row and query `/api/state`; dashboards silently skip rows that do not start with a single `| `.

3. **After dashboard restart, spot-check the affected company:**
   ```bash
   curl -s http://127.0.0.1:3737/api/state | jq '.apps | map(select(.company == "OpenAI"))'
   ```
   If the result is `[]` (empty), the row is being filtered. Check the tracker row format immediately.

4. **If dashboard data is missing but tracker is intact:**

If dashboard data is missing but the tracker appears intact:

1. Grep the tracker row and confirm it starts with a single `|`.
2. Run `node verify-pipeline.mjs`.
3. Query `/api/state` on the affected dashboard port.
4. If tracker is correct but API is stale, restart that dashboard service.
5. If API is correct but browser UI is stale, hard-refresh and browser-smoke-test the UI.

## Why This Happens

The `mcp_Patch` tool doesn't enforce table formatting rules—it just does text replacement. If you're patching within a context that has `||` markers (e.g., at the top of a section or in a template), those may bleed into the replacement string. The dashboard parser assumes all data rows follow the standard Markdown table format, which uses single pipes.

## Quick Diagnosis

If a company is in the tracker but missing from the dashboard:

```bash
# 1. Check tracker format
grep "CompanyName" /Users/robinletim/career-ops/data/applications.md | head -1
# Should output: | <num> | ... (starts with single |)

# 2. Check Node dashboard API response
curl -s http://127.0.0.1:3737/api/state | jq '.apps | map(select(.company == "CompanyName"))'

# 3. If React dashboard is in scope, check its API without assuming HTTP vs HTTPS
curl -s http://127.0.0.1:3940/api/state | jq '.apps | map(select(.company == "CompanyName"))'   || curl -s -k https://127.0.0.1:3940/api/state | jq '.apps | map(select(.company == "CompanyName"))'

# 4. If tracker is correct but API is empty/stale, restart only the affected dashboard service
launchctl kickstart -k "gui/$(id -u)/com.robinletim.career-ops.web-dashboard"

# 5. Wait 2 seconds and re-check API
sleep 2 && curl -s http://127.0.0.1:3737/api/state | jq '.apps | map(select(.company == "CompanyName"))'
```

If the API still returns `[]` after restart, the row format is the issue. Fix and retry.

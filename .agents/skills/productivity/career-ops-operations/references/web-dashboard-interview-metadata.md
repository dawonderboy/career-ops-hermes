# Web dashboard interview metadata debugging

Use this when Career-Ops dashboard entries show `Stage Unknown`, missing calendar chips, or missing join links even though the tracker notes clearly contain interview details.

## Symptoms seen
- `/api/state` returns `interviewType: null`, `interviewDate: null`, `interviewTime: null`
- upcoming interview card does not show the role
- dashboard table does not show the calendar chip
- Google Meet link exists in notes but no join link renders

## Root cause pattern
Historically, `web-dashboard.mjs` only parsed notes starting with `Interview:` or `Interview (Type):`.
Tracker rows in this repo often use stage-specific prefixes instead:
- `Recruiter screen: YYYY-MM-DD ...`
- `Recruiter screen (Intro Chat): ...`
- `Recruiter screen (Phone Screen): ...`
- `Phone Screen: ...`

The fix is to move parsing into a tested helper like `parseInterviewMeta(notes)` in `web-dashboard-lib.mjs`, then reuse it from `web-dashboard.mjs`.

## What the helper should return
- `interviewType`
- `interviewDate`
- `interviewTime`
- `meetingLink`

Normalize bare Meet URLs like `meet.google.com/abc-defg-hij` to `https://meet.google.com/abc-defg-hij`.

## Verification sequence
1. Run tests first:

```bash
node --test tests/web-dashboard-lib.test.mjs
```

2. Syntax-check the dashboard files:

```bash
node --check web-dashboard.mjs && node --check web-dashboard-lib.mjs
```

3. Verify API output for affected apps:

```bash
python3 - <<'PY'
import json, urllib.request
url='http://127.0.0.1:3737/api/state'
with urllib.request.urlopen(url, timeout=10) as r:
    data=json.load(r)
apps=[a for a in data.get('apps', []) if str(a.get('num')) in ('151','109')]
print(json.dumps(apps, indent=2))
PY
```

4. If the API still shows stale nulls, check for port masking:

```bash
lsof -nP -iTCP:3737 -sTCP:LISTEN
ps aux | grep -E '[w]eb-dashboard.mjs|[n]ode .*3737'
launchctl print gui/$(id -u)/com.robinletim.career-ops.web-dashboard | sed -n '1,80p'
```

If both a manual `node web-dashboard.mjs` process and the launchd-managed process are listening, kill the stale manual process and retry the API query.

## Confirmed good outputs from this repo
- `#151 LiveKit` → `Intro Chat`, `2026-05-04`, `10:30am PDT`, `https://meet.google.com/jdf-baem-pfe`
- `#109 Archer Aviation` → `Phone Screen`, `2026-04-29`, `2:00pm PDT`, `meetingLink: null`

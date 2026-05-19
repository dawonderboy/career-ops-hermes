# Google Calendar multi-account link handling

Use this when Career-Ops dashboard calendar/invite links open in the wrong Google account.

## Symptom
- Clicking `Join meeting` or a calendar invite in the dashboard opens another signed-in Google account instead of the account tied to the configured Google Calendar feed.

## Root cause
- Google Calendar `htmlLink` URLs and some Meet links do not reliably select the intended account when the browser has multiple Google sessions.
- Without an explicit `authuser` query parameter, Google may resolve the link against the wrong active account.

## Fix pattern
1. In `config/profile.yml`, store the linked Google account explicitly:

```yaml
calendar:
  google:
    calendar_id: "primary"
    authuser_email: "robinletim@gmail.com"
```

2. In both dashboards (`web-dashboard.mjs` and `web-dashboard.react.mjs`):
   - read `calendar.google.authuser_email`
   - fall back to the calendar ID when the calendar ID itself is an email address
   - normalize rendered Google links with `authuser=<email>` before returning API state / rendering UI

3. Apply the rewrite only to Google-owned calendar/meeting hosts:
   - `calendar.google.com`
   - `www.google.com/calendar/...`
   - `meet.google.com`

4. Leave non-Google meeting URLs unchanged.

## Labeling rule
- For Google Calendar event links: label the action `Open in Calendar`
- For direct meeting URLs: keep `Join` / `Join meeting`

## Verification
- `node --check web-dashboard.mjs && node --check web-dashboard.react.mjs`
- query both APIs and inspect a sample event link:
  - `http://127.0.0.1:3737/api/state`
  - `https://127.0.0.1:3940/api/state`
- confirm sample `meetingLink` includes `authuser=<linked-email>`
- confirm both dashboards still report `calendarSource: google-calendar`

## Session example
- Linked calendar account: `robinletim@gmail.com`
- Verified sample output from both dashboards included:
  - `https://www.google.com/calendar/event?...&authuser=robinletim%40gmail.com`

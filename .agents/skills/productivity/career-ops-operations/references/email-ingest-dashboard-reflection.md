# Email-ingest updates not reflecting on Career-Ops dashboard

Problem class:
- User says the forwarded email arrived and ingest processed it, but the Career-Ops dashboard still looks unchanged.

Observed case:
- Career-Ops dashboard was the app on `http://127.0.0.1:3737/`.
- Hermes dashboard on `:8088` / `:8443` is a different app; checking the wrong dashboard can look like missing data.
- `/api/state` at `http://127.0.0.1:3737/api/state` already exposed current tracker rows.
- `Electronic Arts` status was `Interview`, but the notes field initially remained the old application note.
- Root cause was in `email-ingest.mjs`: interview note prefixes were only written when `parsed.datetime` existed.
- For interview-like recruiter emails without a precise datetime, status changed to `Interview` but notes stayed visually unchanged, so the dashboard row appeared stale.

Before inspecting rendered UI, load:

- `references/tracker-dashboard-sync-pitfalls.md`
- `references/tracker-dashboard-multi-layer-sync-verification.md`

Use this sequence:

1. Did the tracker row change?
2. Does `/api/state` reflect the tracker change?
3. Does the browser UI reflect `/api/state`?

Useful checks:
1. Confirm the tracker row in `data/applications.md` actually changed.
2. Query `http://127.0.0.1:3737/api/state` and inspect the exact app object for the company.
3. Only after that, inspect the rendered dashboard HTML/browser state.

Fix pattern:
- In `applyUpdate()` inside `email-ingest.mjs`, for `parsed.event === 'Interview'`:
  - if `parsed.datetime` exists, prefix `Interview: ...`
  - otherwise prefix `Interview update YYYY-MM-DD — <summary>.`
- Sanitize trailing punctuation in summaries before prefixing.
- Avoid exact duplicate prefixes during backlog replay.

Replay safety guard:

- Replay only a bounded window that contains the missing messages.
- Before replay, snapshot affected tracker rows and latest ingest logs.
- Check `data/email-ingest-review.md` for existing parser/no-match entries.
- Do not replay repeatedly if tracker notes already changed.
- After replay, inspect affected rows for duplicate `Interview:` / `Interview update:` prefixes.
- Replay is a recovery action, not a health check.

Verification pattern:
- `node --check email-ingest.mjs`
- replay a bounded backlog window that contains the missed messages
- inspect `data/applications.md`
- query `http://127.0.0.1:3737/api/state`
- optionally confirm row text in a browser snapshot/console
- run `./career-ops-automation.sh verify`

Concrete session outcome:
- EA row gained visible interview-update notes without requiring a scheduled datetime.
- LiveKit duplicate `Interview:` prefixes were manually cleaned in `data/applications.md` after repeated replays.

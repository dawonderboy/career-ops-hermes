# Email-ingest interview datetime fallback

Replay safety guard:

- Replay only a bounded window that contains the missing messages.
- Before replay, snapshot affected tracker rows and latest ingest logs.
- Check `data/email-ingest-review.md` for existing parser/no-match entries.
- Do not replay repeatedly if tracker notes already changed.
- After replay, inspect affected rows for duplicate `Interview:` / `Interview update:` prefixes.
- Replay is a recovery action, not a health check.


Problem class:
- A forwarded recruiter email or calendar invite is correctly classified as `Interview`, but Codex returns `datetime: null`.
- Without a concrete datetime in tracker notes, the dashboard cannot show the interview as scheduled even when the confirmation email clearly contains the time.

Observed cases:
- LiveKit-style confirmation emails can include explicit body text such as `May 4, 2026 at 10:30am PDT with Lauren Fanning`.
- Calendar attachments may include a reliable `DTSTART` line, for example:
  - `DTSTART;TZID=America/Los_Angeles:20260504T103000`
  - `DTSTART:20260504T173000Z`
- Calendly/Zoom scheduling-request emails may be interview-related but still contain no booked slot. Example wording:
  - `Please find a day and time that works best for you.`
  - In that case, the email should update status/notes as an interview touchpoint but must not invent a scheduled datetime.

Fix pattern:
1. Keep the LLM extraction as the first pass.
2. After parsing, if `parsed.event === 'Interview'` and `parsed.datetime` is null, run a deterministic fallback helper.
3. The fallback should:
   - parse explicit textual confirmation lines like `May 4, 2026 at 10:30am PDT`
   - parse ICS `DTSTART` values, including `TZID=America/Los_Angeles` and UTC `Z` forms
   - normalize output to the tracker/dashboard-friendly format:
     - `YYYY-MM-DD h:mmam/pm TZ`
4. Only if the fallback still returns null should the tracker note remain `Interview update YYYY-MM-DD — ...`.

Implementation guidance:
- Put the regex/date parsing in a dedicated helper module rather than inline in `email-ingest.mjs`.
- Add `node:test` coverage for:
  - explicit confirmation text
  - scheduling-request email with no booked slot
  - ICS `DTSTART` extraction
- Restart the email watcher after deploying the change.

Verification pattern:
- `node --check email-ingest-lib.mjs`
- `node --check email-ingest.mjs`
- `node --test tests/email-ingest-lib.test.mjs`
- `./tests/career-ops-automation.test.sh`
- `./career-ops-automation.sh verify`
- optional: replay a bounded backlog window containing a known interview confirmation and confirm the tracker note becomes `Interview: ...`

Session outcome that motivated this note:
- EA/Tori Calendly email was correctly recognized as interview-related but had no actual booked time in the forwarded body, so null was the correct result.
- The missing capability was for true confirmation emails/ICS content where a real time does exist but the LLM misses it.

# Dashboard Testing & Verification Patterns

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

**Context:** The web-dashboard evolved from read-only display to interactive control panel with PWA, pipeline triggers, and rich interview metadata. This reference documents testing patterns and verification flows.

## Architecture: Pure Helpers + Dashboard Server

```
web-dashboard.mjs (main server, 1000+ lines)
  ├─ /api/state endpoint → returns app state
  ├─ /api/pipeline endpoint → POST trigger pipeline
  └─ imports web-dashboard-lib.mjs for pure logic

web-dashboard-lib.mjs (tested pure functions)
  ├─ parseInterviewMeta(notes) → {date, time, type, interviewer, meetingLink}
  ├─ classifyPriority(app) → {level, key, label, reason}
  ├─ buildActionQueue(apps, today) → array of action items
  ├─ parsePostingDateFromReport(text) → {date, display}
  └─ summarizeReadiness(app) → {report, pdf, coverLetter, applyPack}

tests/web-dashboard-lib.test.mjs (10 tests, all passing)
```

## Testing Strategy

### Unit Tests: Pure Helpers

Test each function in isolation with real data from Career-Ops:

```javascript
// tests/web-dashboard-lib.test.mjs
import test from 'node:test';
import assert from 'node:assert';
import { parseInterviewMeta, classifyPriority, parsePostingDateFromReport } from '../web-dashboard-lib.mjs';

test('parseInterviewMeta extracts recruiter-screen datetime, type, and meeting link', () => {
  const notes = 'Recruiter screen: 2026-04-24 10:00am PT. Join: https://zoom.us/j/123';
  const result = parseInterviewMeta(notes);
  
  assert.deepEqual(result.interviewType, 'Recruiter screen');
  assert.deepEqual(result.interviewDate, '2026-04-24');
  assert.deepEqual(result.interviewTime, '10:00am PT');
  assert.deepEqual(result.meetingLink, 'https://zoom.us/j/123');
});

test('classifyPriority ranks high-scoring recent apps as high', () => {
  const app = {
    score: 4.8,
    status: 'Evaluated',
    date: new Date().toISOString().split('T')[0],
  };
  const priority = classifyPriority(app);
  
  assert.deepEqual(priority.level, 3);
  assert.deepEqual(priority.key, 'high');
});

test('parsePostingDateFromReport extracts ISO created dates from posting-age tables', () => {
  const reportText = `
| Posting age | 2026-03-25, ~30 days old | Positive |
  `;
  const result = parsePostingDateFromReport(reportText);
  
  assert.deepEqual(result.date, '2026-03-25');
  assert.match(result.display, /30 days/);
});
```

**Key patterns:**
- Use real data from tracker entries (copy from `data/applications.md`)
- Test boundary conditions (null interviewer, missing date, old posting)
- Assert both structure and content
- Run with `node --test tests/web-dashboard-lib.test.mjs`

### Integration Tests: API Endpoints

Test dashboard endpoints against real tracker data:

```bash
# 1. Start dashboard if not already running
node web-dashboard.mjs --host 127.0.0.1 --port 3737 &

# 2. Test Node /api/state endpoint
curl http://127.0.0.1:3737/api/state | jq '.apps | length'

# 2b. If React dashboard is in scope, test without assuming HTTP vs HTTPS
curl -s http://127.0.0.1:3940/api/state | jq '.apps | length' \
  || curl -s -k https://127.0.0.1:3940/api/state | jq '.apps | length'
# Should return 200+

# 3. Verify interview metadata is parsed
curl http://127.0.0.1:3737/api/state | jq '.apps[] | select(.interviewDate != null) | {company, interviewDate, interviewTime, interviewer, meetingLink}' | head -40

# 4. Test /api/pipeline endpoint
curl -X POST http://127.0.0.1:3737/api/pipeline
# Should return: {"ok": true, "startedAt": "2026-05-04T..."}

# 5. Monitor pipeline logs
tail -f logs/pipeline-trigger.log
# Should show pipeline execution output + exit=0
```

### End-to-End Flow

Simulate complete workflow:

```bash
# 1. Verify tracker is clean
node verify-pipeline.mjs
# Should show: 0 errors, 0 warnings

# 2. Start dashboard
ps aux | grep web-dashboard
# Should be running

# 3. Trigger pipeline from API
curl -X POST http://127.0.0.1:3737/api/pipeline

# 4. Verify tracker was updated
node verify-pipeline.mjs
# Should still be clean (no new errors from pipeline run)

# 5. Check logs
tail -20 logs/pipeline-trigger.log
# Should show ranking, scores, recommendations
```

## Interview Metadata Extraction

The most complex parsing: `parseInterviewMeta(notes)` handles multiple formats:

### Supported Note Formats

```javascript
// Format 1: Simple prefix with date
'Interview: 2026-04-24 10:00am PT'

// Format 2: Typed stage with date
'Recruiter screen (Intro Chat): 2026-04-24 10:00am PT'

// Format 3: Full narrative with metadata
'Phone Screen: 2026-04-24 2:30pm ET. Interviewer: Sarah Chen. Zoom: https://zoom.us/j/123'

// Format 4: Multiple lines
`Hiring Manager: 2026-04-24
Time: 10:00am PT  
Contact: Robin Luu (Manager)
Join: https://meet.google.com/abc-defg-hij`

// Format 5: Calendar header (from email-ingest fallback)
`Accepted by you
April 24
10:00 AM - 10:30 AM GMT-07:00`
```

### Extraction Order

```javascript
export function parseInterviewMeta(notes) {
  // 1. Extract stage type
  const stageMatch = notes.match(/Interview(?:\s*\(([^)]+)\))?|Recruiter screen|Phone Screen|Hiring Manager|Fit Call/i);
  // → interviewType: 'Interview', 'Recruiter screen', 'Hiring Manager', etc.
  
  // 2. Extract date (multiple patterns)
  //    a) YYYY-MM-DD (ISO)
  //    b) Month DD, YYYY (textual)
  //    c) Month DD (inferred current/next year)
  // → interviewDate: '2026-04-24'
  
  // 3. Extract time (multiple patterns)
  //    a) HH:MMam/pm TZ
  //    b) H:MM AM/PM
  //    c) DTSTART from ICS fallback
  // → interviewTime: '10:00am PT'
  
  // 4. Extract interviewer (names, titles)
  //    Patterns: 'Interviewer: Name', 'with Name', 'Contact: Name'
  // → interviewer: 'Sarah Chen'
  
  // 5. Extract meeting URL
  //    Patterns: https://zoom.us, https://meet.google.com, https://teams.microsoft.com
  // → meetingLink: 'https://zoom.us/j/123'
  
  return { interviewType, interviewDate, interviewTime, interviewer, meetingLink };
}
```

**Testing strategy:** Create test cases from real tracker notes; update when new formats are encountered.

## Dashboard State API

The `/api/state` endpoint returns rich metadata for all applications:

```json
{
  "apps": [
    {
      "num": 243,
      "company": "Huntress",
      "role": "Senior IT Support Engineer",
      "score": 4.9,
      "status": "Evaluated",
      "priority": {
        "level": 3,
        "key": "high",
        "label": "Apply",
        "reason": "High score, recent posting, good fit"
      },
      "readiness": {
        "report": true,
        "pdf": true,
        "coverLetter": true,
        "applyPack": "ready"
      },
      "interviewType": "Hiring Manager",
      "interviewDate": "2026-05-01",
      "interviewTime": "2:00pm PT",
      "interviewer": "Jane Smith",
      "meetingLink": "https://zoom.us/j/987654321",
      "postingCreatedAt": "2026-04-20",
      "postingCreatedDisplay": "14 days old"
    }
  ]
}
```

**For UI rendering:**
- Use `priority.level` for sorting (3=high, 2=medium, 1=low, 0=skip)
- Use `readiness.applyPack` to show apply-pack status
- Use `interviewDate` + `interviewTime` for calendar chips
- Use `meetingLink` for join-button href
- Use `postingCreatedDisplay` for "posted X days ago" column

## Performance Notes

- `parseInterviewMeta()` uses regex; O(1) per notes string
- `classifyPriority()` uses score + date; O(1) per app
- `buildActionQueue()` sorts apps; O(n log n) for n apps
- Dashboard serves 200+ apps; initial render ~100ms, updates ~10-50ms
- API response JSON is ~500KB for full tracker

**Optimization:** If dashboard gets slow, add caching:
```javascript
const appCache = new Map();
const CACHE_TTL = 30_000; // 30 seconds

function getCachedState() {
  const now = Date.now();
  if (appCache.has('state') && appCache.get('time') > now - CACHE_TTL) {
    return appCache.get('state');
  }
  const state = buildState();
  appCache.set('state', state).set('time', now);
  return state;
}
```

## PWA Support

Dashboard includes PWA icons (embedded PNG, no external files):

```javascript
const ICON_180 = makePng(180);  // 180x180px icon
const ICON_192 = makePng(192);  // 192x192px icon

// Served at /icon-180.png and /icon-192.png
// Manifest at /manifest.json
```

**Testing PWA:**
- Open dashboard in Chrome: `http://localhost:3737`
- Install: "Install app" button appears
- App icon appears on home screen
- Works offline (limited feature set)

## Common Pitfalls

1. **Interview date parsing collision:** Multiple date formats in same notes string
   - **Solution:** `parseInterviewMeta()` uses regex with careful precedence (ISO first, then textual)
   
2. **Zoom link extraction:** URLs can be `https://zoom.us/j/ID`, `zoom.us/my/vanity`, or bare `zoom.us/ID`
   - **Solution:** Regex with optional scheme: `/https?:\/\/.*zoom/i`

3. **Interviewer name from "with Name":** Captures too much ("with Name and Sarah")
   - **Solution:** Use word boundary: `/with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/`

4. **Stale app state cached:** Dashboard shows old data after tracker update
   - **Solution:** File watchers trigger refresh on `applications.md` change; clear cache on update

5. **Empty interview fields in JSON:** Dashboard filters for `!= null`, but falsy values like empty string break sorting
   - **Solution:** Normalize to `null` not `""` in `parseInterviewMeta()` return

## Future Enhancements

- [ ] Show "interview in 3 hours" countdown
- [ ] Export interview calendar (iCal format)
- [ ] Interview notes export to Markdown
- [ ] Multi-round interview timeline visualization
- [ ] Candidate pool comparison (apply-pack feature matrix)

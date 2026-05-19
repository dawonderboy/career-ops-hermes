# Calendar Meeting Link Labels — May 2026 Implementation

## Summary

As of May 6, 2026, both dashboards (`web-dashboard.mjs` port 3737 and `web-dashboard.react.mjs` port 3940) now distinguish between **calendar-sourced meeting links** and **direct meeting URLs** when rendering action buttons for scheduled interviews.

## Label Taxonomy

| Link Source | Label | Behavior | Use case |
|-------------|-------|----------|----------|
| Google Calendar event URL | "Open in Calendar" | Opens `https://calendar.google.com/calendar/...` | Interview scheduled via Google Calendar invite; user prefers to view full event details in Calendar app |
| Direct meeting URL | "Join meeting" or "Join" | Opens Zoom/Google Meet/Teams URL directly | Interview scheduled with direct meeting link; user can join immediately without Calendar context |

## Implementation

Both dashboards check if a meeting link is a Google Calendar URL (`calendar.google.com`) versus a direct meeting service URL:

**web-dashboard.mjs** — search for `calendarLink` / `meetingLink` handling:
- If `meetingLink` is a Google Calendar URL, render "Open in Calendar"
- If `meetingLink` is a Zoom/Meet/Teams URL, render "Join meeting"

**web-dashboard.react.mjs** (mock/calendar-view.jsx) — similar logic:
- Check `link.includes('calendar.google.com')` to determine label
- Render appropriate button text and handle click behavior

## Background

Previously, all meeting-related action buttons were labeled "Join meeting" regardless of source. This was confusing when the link pointed to a Calendar event rather than a direct meeting URL, because:
- Clicking a Calendar link sometimes required authentication or showed the wrong context
- Users expected different affordances for "view calendar event" vs. "join Zoom immediately"

## Code Locations

**Original dashboard:**
- `/Users/robinletim/career-ops/web-dashboard.mjs` — search for `stageChip`, `meetingLink`, `calendarLink` variables

**React dashboard:**
- `/Users/robinletim/career-ops/mock/calendar-view.jsx` — interview card component rendering
- `/Users/robinletim/career-ops/web-dashboard.react.mjs` — state API population

## Testing

After any change to this logic, verify both dashboards render the correct label:

1. **Check an app with a Google Calendar event URL:**
   - Expected: "Open in Calendar" button
   - Test: Click it, verify Calendar opens to the event

2. **Check an app with a direct meeting URL (Zoom/Meet/Teams):**
   - Expected: "Join meeting" button
   - Test: Click it, verify the meeting service loads

3. **Check an app with no meeting link:**
   - Expected: No action button (or a gray "Schedule" placeholder if implemented)

## Future Enhancements

- **Smart detection of meeting type:** Parse URL and detect Zoom/Teams/Meet in addition to Google Calendar
- **Fallback icons:** Use emoji or Unicode symbols (📅 for calendar, 🔗 for meeting URL) to aid scanning
- **Copy-to-clipboard option:** For technical interviews where the user might need the URL in a terminal or prepared pastebin

## Related

- `interview-prep-filename-conventions.md` — naming conventions for interview prep materials
- `web-dashboard-interview-progression.md` — interview stage emoji and progression order
- `web-dashboard-interview-metadata.md` — how interview details are extracted and stored

# Career-Ops React Dashboard UI Review (May 2026)

## Context

Full visual audit conducted May 16, 2026. Dashboard at port 3940, three tabs: Pipeline, Kanban, Progress.
271 tracked applications at time of review.

## Completed Fixes (Batch 1 — May 16, 2026)

Commit: `3fbad9f`

| # | Issue | Fix | File(s) |
|---|-------|-----|---------|
| A | No SKIP filter tab | Added "SKIP" to STATUS_OPTIONS + STATUSES arrays | HTML, pipeline-view.jsx |
| B | Overdue Kanban card not highlighted | Yellow border + tint + glow when `is_followup_overdue` | kanban-view.jsx |
| C | Scan Queue full panel shown when idle | Early-return compact row (label + "idle" + Run scan btn) | scan-queue.jsx |
| D | Pipeline status showed "last: never" | `seedStateFromLogs()` at boot; prefer `finishedAt`; fallback "not recorded" | web-dashboard.react.mjs, HTML |

## Deferred Improvements (Batch 2 — not yet implemented)

### High impact

5. **SKIP filter tab in Progress/Funnel** — The funnel chart excludes SKIP entries without explanation. Add "N unrated / SKIP excluded" label to score distribution chart.

6. **Weekly Activity trend line** — Progress tab bar chart has no trend overlay. A 3-week moving average would surface whether pace is accelerating or cooling.

### Medium impact

7. **TLDR column mostly empty** — Most rows show "–". Either populate from report one-liner or add column toggle to hide it.

8. **Kanban horizontal scroll** — Columns are vertically stacked. Natural UX for a kanban is side-by-side horizontal scroll. Current layout loses stage-flow visibility.

9. **"0 within 48h" badge styled orange** — Zero count should be neutral/gray. Orange should only fire when count > 0.

10. **Calendar past events clutter** — "12 past" events mixed in. Past events should be dimmed or hidden by default with "show past" toggle.

### Low impact / polish

11. **Duplicate row in Pipeline** — Entry with TLDR explicitly saying "Duplicate of #14" should surface a dedup warning badge on the row, not just buried text.

12. **No date range filter** — All views show all-time data. A "last 30 days" filter would help weekly reviews.

13. **No CSV export** — A simple export button on Pipeline tab would support ad-hoc analysis.

## Architecture Notes for Future Dashboard Changes

- **Two filter arrays must stay in sync**: `STATUS_OPTIONS` in HTML inline script AND `STATUSES` in `pipeline-view.jsx`. Always update both when adding a new status.
- **Kanban overdue uses `is_followup_overdue`** from `normalizeKanban()` in `web-dashboard-lib.mjs`. Any UI counting or highlighting must use this field — do not recompute client-side.
- **`m.overdue_followups_count`** in `kanban.metrics` is the authoritative count for header badge. Card highlight uses `record.is_followup_overdue`. They are computed from the same source in the same pass — always in sync.
- **launchd manages the React dashboard** at `com.robinletim.career-ops.web-dashboard-react`. Use `launchctl kickstart -k gui/$(id -u)/com.robinletim.career-ops.web-dashboard-react` to restart after code changes. Do NOT use port 3940 directly with `node ... &`.

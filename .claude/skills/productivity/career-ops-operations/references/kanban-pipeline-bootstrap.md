# Detailed Kanban Pipeline Bootstrap for Career-Ops

Use this when the user wants a stage-specific application pipeline reflected in both Career-Ops dashboards.

## When to use

- User provides a hand-curated priority pipeline
- User wants more than generic tracker states like `Interview`
- User wants both the regular dashboard and React dashboard to show exact interview/application stages
- Claude Code will implement the code, while Hermes prepares the structured data + implementation prompt

## Durable approach

1. Keep `data/applications.md` as the legacy canonical tracker.
2. Add a separate user-layer structured file: `data/kanban-pipeline.json`.
3. Treat the JSON file as the source of truth for detailed stage display.
4. Generate an implementation-ready prompt for Claude Code rather than editing dashboard code directly when acting as planner/orchestrator.
5. Preserve both dashboard backends (`web-dashboard.mjs`, `web-dashboard.react.mjs`) and require additive `/api/state` changes only.

## Recommended JSON shape

Top-level fields:
- `schema_version`
- `created_at`
- `updated_at`
- `timezone`
- `source`
- `stages`
- `records`

Each record should include:
- `id`
- `company`
- `role`
- `priority`
- `status`
- `current_stage`
- `recommended_new_stage`
- `interview_subtype`
- `interview_date_time`
- `people_involved`
- `next_action`
- `follow_up_due_date`
- `prep_status`
- `prep_focus`
- `win_condition_next_interview`
- `risk_flags`
- `dashboard_update_needed`
- `regular_board_status`
- `tracker_refs`
- `board_scope`
- `notes`
- `last_confirmed_by`

## Stage list used in the successful bootstrap

1. Target / Research
2. Applied / Awaiting Response
3. Recruiter Outreach
4. Recruiter Screen Scheduled
5. Recruiter Screen Completed
6. Hiring Manager Screen Scheduled
7. Hiring Manager Screen Completed
8. Technical / Functional Screen Scheduled
9. Technical / Functional Screen Completed
10. Panel / Virtual Onsite Scheduled
11. Panel / Virtual Onsite In Progress
12. Panel / Virtual Onsite Completed
13. In-Person Onsite Scheduled
14. In-Person Onsite Completed
15. Final Leadership / Executive Round
16. References / Background Check
17. Offer / Negotiation
18. Accepted
19. Rejected
20. Withdrawn / Paused

## Mapping rules

- Prefer the user-provided stage over the generic tracker status when they conflict.
- Use `tracker_refs` to connect structured records back to existing `applications.md` rows.
- Do not mutate `applications.md` during bootstrap unless the user explicitly asks for tracker edits.
- Keep historical lanes visible but separated: `Rejected`, `Withdrawn / Paused`, and closed/historical entries.
- Flag interviews within 48 hours and overdue follow-ups in the structured layer.

## Implementation prompt requirements for Claude Code

The prompt should explicitly require:
- both dashboards to load `data/kanban-pipeline.json`
- additive `/api/state` changes returning a top-level `kanban` object
- derived fields like `stage_index`, `is_active`, `is_historical`, `is_within_48h`, `is_followup_overdue`, and `primary_tracker_num`
- UI emphasis on `next_action`
- compact risk flags and max 3 prep bullets
- no private meeting links on cards by default
- preservation of existing tracker, actions, and calendar behavior

## Good seeded records

For each active lane, include:
- exact current stage
- next action
- due date
- prep focus
- win condition
- risk flags
- tracker row references

This makes the bootstrap useful immediately even before Claude Code finishes the UI work.

## Pitfalls

- Do not try to overload `applications.md` with 20-stage workflow columns during initialization; that file still powers legacy tracker flows and generic statuses.
- Do not collapse all active roles into `Interview` in the new layer.
- Do not expose private meeting links in the JSON seed unless the user explicitly asks.
- Do not lose historical/paused lanes; they matter for board completeness and context.
- Do not frame the coding prompt as a rewrite. Require additive, backward-compatible integration.

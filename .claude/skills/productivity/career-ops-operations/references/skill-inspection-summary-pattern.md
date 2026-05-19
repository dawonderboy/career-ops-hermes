# Skill inspection / summary pattern

Use when the user asks what is inside `career-ops-operations` or asks for a quick orientation to the skill rather than asking to run an operation.

## Pattern

1. Load the skill normally with `skill_view(name='career-ops-operations')`.
2. If the returned SKILL.md is too large for direct reading, use the persisted-output path from the tool result instead of reloading repeatedly.
3. Extract high-signal structure rather than dumping the full text:
   - description
   - top-level and second-level headings
   - linked reference filenames
   - any sections directly relevant to the user's question
4. Summarize in plain language grouped by workflow area: setup/update, scan, pipeline, tracker/dashboard, apply packs, interview prep, email ingest, dashboard ops, PDFs, migration/refactor notes, and pitfalls.
5. Do not paste the entire skill or the full reference list unless the user explicitly asks for it. Prefer a compact orientation and offer to open a specific section/reference next.

## Why

`career-ops-operations` is intentionally large and reference-heavy. A useful answer to “what’s in it?” is an index-style orientation, not a raw dump. Future agents should reduce the skill to navigable categories and identify where detailed references live.
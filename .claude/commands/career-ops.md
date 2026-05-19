---
description: AI job search command center — show menu or evaluate job description
---

Career-ops router. Arguments provided: "$ARGUMENTS"

Read `modes/_shared.md` and `AGENTS.md` for system context.

If "$ARGUMENTS" contains a job description or URL (keywords like "responsibilities", "requirements", "qualifications", "about the role", "http", "https"):
- Read `modes/auto-pipeline.md` then execute auto-pipeline mode on the provided input.

Otherwise, show this menu:

```
career-ops — Command Center

Available commands:
  /career-ops {JD or URL}     → AUTO-PIPELINE: evaluate + report + tracker
  /career-ops-pipeline        → Process pending URLs from inbox
  /career-ops-evaluate        → Evaluation only A-G (no auto PDF)
  /career-ops-compare         → Compare and rank multiple offers
  /career-ops-contact         → LinkedIn outreach: find contacts + draft message
  /career-ops-deep            → Deep research about a company
  /career-ops-pdf             → Generate ATS-optimized CV PDF
  /career-ops-training        → Evaluate course/cert against North Star
  /career-ops-project         → Evaluate a portfolio project idea
  /career-ops-tracker         → Application status overview
  /career-ops-apply           → Live application assistant
  /career-ops-scan            → Scan portals and discover new offers (liveness-verified)
  /career-ops-batch           → Batch processing with parallel workers
  /career-ops-patterns        → Analyze rejection patterns
  /career-ops-followup        → Follow-up cadence tracker

Tip: Paste a job URL or description directly to run the full pipeline.
```

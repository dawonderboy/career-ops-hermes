# I Built an AI Job Search Command Center — Here's How It Actually Works

I'm Robin. Senior IT support / executive tech specialist in Fremont, CA. I've been in the weeds of endpoint management, zero-trust rollouts, MDM, and the kind of escalation queue that never empties. I know how to keep a CTO's laptop alive at 11pm before a board meeting, but job searching? That's a different kind of operational problem.

This post is about how I turned the job search into a system I can actually reason about — using a multi-agent AI setup built around a tool called Hermes, a forked open-source project called Career-Ops, and a tracker that I actually look at.

---

## The Problem With Job Searching as a Technical Person

If you're in IT, you know how to build systems. You automate the boring stuff. You document things. You have runbooks.

And then you start job searching and you're back to copy-pasting job descriptions into a Google Doc, manually tracking applications in a spreadsheet that gets stale after week two, and trying to remember why you applied to a company three weeks ago when they finally email you back.

I wanted the job search to feel less like a second job and more like an ops pipeline I was running.

---

## What Career-Ops Is

Career-Ops is an open-source project by Santiago Fernández de Valderrama. He used it to evaluate 740+ job offers, generate 100+ tailored CVs, and land a Head of Applied AI role. The system lives entirely in your CLI — no SaaS, no subscriptions, no black boxes.

What it does:

- Evaluates job postings against your actual CV and profile
- Scores each offer on a 5-point scale with structured reasoning
- Generates tailored PDFs for roles you decide to pursue
- Tracks your pipeline in a clean Markdown file
- Scans company career portals directly (Greenhouse, Ashby, Lever) without burning tokens on generic job boards
- Builds interview prep reports with STAR stories and company research

The original system is designed to work with any AI coding CLI — Claude Code, Codex, Gemini, Copilot, and others. It reads a set of instruction files called "modes" and uses them to guide the model through evaluation, CV generation, and application work.

The repo is at: https://github.com/santifer/career-ops

---

## What I Built On Top

I forked Career-Ops and wired it into Hermes — an open-source AI agent orchestration layer that runs on my Mac as an always-on coordinator.

My public fork lives at: https://github.com/dawonderboy/career-ops-hermes

The architecture looks like this:

```
Hermes Agent (always-on, orchestrates everything)
    |
    |-- ChatGPT / OpenAI Codex  (primary reasoning, evaluations, routing)
    |-- Claude Sonnet            (implementation, PDF generation, debugging)
    |-- Gemini CLI               (optional, available for cross-check)
    |
Career-Ops (job-search workflow layer)
    |
    |-- Evaluation reports in reports/
    |-- Tracker in data/applications.md
    |-- PDFs in output/
    |-- Portal scanner (scan.mjs)
    |-- React dashboard on port 3940
    |-- Node.js dashboard on port 3737
```

Hermes acts like a shift supervisor. It delegates bounded tasks to Claude Code (generate this PDF, parse this JD, run this script), uses ChatGPT/Codex for reasoning and decisions, and keeps the state of the pipeline across sessions. It has persistent memory, so it knows my job targets, my deal-breakers, my preferred companies, and my work history without me repeating it every time.

---

## The Tracker

The tracker lives in `data/applications.md` as a Markdown table. One row per application. Columns: number, date, company, role, score, status, PDF, report link, notes.

Status flows through canonical states: Evaluated → Applied → Responded → Interview → Offer → Rejected / Discarded / SKIP.

The reason I keep it in Markdown instead of a database or a spreadsheet: every AI agent can read and write it without a schema migration. Hermes can add a row. Claude Code can update a status. The React dashboard reads it via a shared API. No sync issues, no proprietary format, no vendor lock-in.

When I evaluate a job posting, the agent:

1. Verifies the posting is still live (via Playwright, not just a web fetch)
2. Reads my CV and profile
3. Scores the offer across multiple dimensions (role fit, comp, remote policy, company health, growth potential)
4. Writes a structured report to `reports/`
5. Generates a tailored PDF if the score clears the threshold
6. Writes a TSV row to `batch/tracker-additions/`
7. Merges it into the tracker with `node merge-tracker.mjs`

The dedup logic matters — if I accidentally evaluate the same role twice, the merge script catches it and updates the existing row instead of creating a duplicate.

---

## The Email Ingest Pipeline

One thing I added that isn't in the upstream project: email ingest.

Recruiters send stuff to my actual email. Instead of manually copying job descriptions into the pipeline, I set up a forwarding address that drops messages into an ntfy topic. Hermes listens on that topic, picks up the message, extracts the job URL or description, and adds it to `data/pipeline.md` as a pending evaluation.

Next time I open the terminal and run the pipeline mode, everything that came in over email is queued up and ready to evaluate. I didn't have to touch it.

---

## Why I Use Multiple Models

This took some trial and error to get right.

The job is not to use the smartest model for everything. The job is to use the right model for each task and avoid paying reasoning costs on mechanical work.

My current routing:

- **ChatGPT / OpenAI Codex via Hermes**: Main coordinator. Evaluations, offer scoring, narrative decisions. High-quality reasoning on ambiguous judgment calls.
- **Claude Sonnet**: Implementation work. PDF generation, script runs, file edits, debugging. Bounded, verifiable tasks where I can check the output.
- **Gemini CLI**: Available as a cross-check when I want a second opinion on a score or a company research pass.

Hermes manages the routing automatically based on the task type. I don't have to think about which model to invoke — I just describe what I need.

---

## What I Actually Use It For

On a typical week:

- New job postings land in my pipeline from portal scans and email ingest
- I run the pipeline mode: Hermes evaluates each one, writes reports, generates PDFs for anything scoring 4.0+
- I review the dashboard, click into the reports for anything interesting, and move statuses to Applied
- Before a recruiter call, I run the interview-prep mode: Hermes builds a company research report and queues up likely questions with my talking points
- After a rejection or a pass, I note it in the tracker and run the patterns analysis occasionally to see if there are trends in what's sticking and what isn't

The whole thing is local-first. My CV, my evaluations, my recruiter notes — none of it goes to a third party. The AI models see job descriptions and my CV during evaluation, but nothing persists outside my machine.

---

## The Technical Bits Worth Knowing

If you're an IT person and this sounds interesting:

- The system runs on Node.js. The main scripts are `.mjs` modules. No build step.
- PDF generation uses Playwright (headless Chromium). You need it installed.
- The scanner hits Greenhouse, Ashby, and Lever APIs directly. No scraping. Zero LLM cost for discovery.
- The tracker is a plain Markdown table. The merge script handles all the column alignment and dedup logic.
- The React dashboard is optional. The Node.js dashboard is simpler and works fine as the primary view.
- Everything is gitignored except the system files. Your CV, reports, tracker, and output never leave your local repo.

---

## What It's Not

This is not a mass-application bot. The system is deliberately designed to slow you down at the right moments.

It will not submit an application without you reviewing it. It will flag low-scoring offers and recommend against applying. It generates tailored PDFs — not generic spam.

The goal is fewer, better applications. Quality control over volume. If a role scores below 4.0, the system pushes back. You can override it, but you have to make a conscious decision to do so.

That matches how I want to run a job search. I'm not trying to apply to 200 jobs. I'm trying to identify the 10 roles where I'm a strong fit and put serious effort into each one.

---

## Where to Find It

My public fork (Hermes orchestration + sanitized setup):
https://github.com/dawonderboy/career-ops-hermes

The original Career-Ops project by Santiago:
https://github.com/santifer/career-ops

Hermes (the AI agent layer):
https://claude-code.nousresearch.com

---

If you're in IT or any technical ops role and you're running a job search right now, I'm happy to talk through how to adapt this for your situation. The system is designed to be customized — the archetypes, the scoring weights, the company list, the portal targets. It's meant to fit your search, not a generic template.

Robin

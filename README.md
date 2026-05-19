# Career-Ops Public Clean

[English](README.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [한국어](README.ko-KR.md) | [日本語](README.ja.md) | [Русский](README.ru.md) | [简体中文](README.cn.md) | [繁體中文](README.zh-TW.md)

<p align="center">
  <a href="https://x.com/santifer"><img src="docs/hero-banner.jpg" alt="Career-Ops — Multi-Agent Job Search System" width="800"></a>
</p>

<p align="center">
  <strong>A public fork of Santiago Fernández de Valderrama's Career-Ops system, extended with Hermes Agent orchestration, multi-model routing, dashboard work, and a sanitized public release path.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Hermes_Agent-Orchestrator-7C3AED?style=flat" alt="Hermes Agent">
  <img src="https://img.shields.io/badge/ChatGPT%2FCodex-Main_Model-10A37F?style=flat&logo=openai&logoColor=white" alt="ChatGPT / Codex">
  <img src="https://img.shields.io/badge/Claude_Code-Worker-000?style=flat&logo=anthropic&logoColor=white" alt="Claude Code">
  <img src="https://img.shields.io/badge/Gemini_CLI-Optional-4285F4?style=flat&logo=google&logoColor=white" alt="Gemini CLI">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white" alt="Go">
  <img src="https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white" alt="Playwright">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
</p>

---

## What This Repository Is

This repository is not a replacement for the original Career-Ops project. It is a public, sanitized fork that preserves the original job-search automation system while documenting the extra orchestration work I built around it.

The original project by Santiago Fernández de Valderrama turns an AI coding CLI into a job-search command center: job evaluation, tailored CV generation, portal scanning, tracker updates, interview prep, and application workflow support.

My work in this fork focuses on making that system run as a multi-agent operating environment:

- Hermes Agent as the always-on coordinator
- ChatGPT/OpenAI Codex as the primary Hermes reasoning model
- Claude Code / Claude Sonnet as a bounded implementation and debugging worker
- Career-Ops as the job-search workflow layer
- A React dashboard variant alongside the original dashboard tooling
- Public-safe documentation and setup notes so the architecture can be understood without exposing private job-search data

This README is intentionally different from the upstream README. The upstream README explains the product from the original author's perspective. This README explains the fork, the integration work, and how Hermes, Claude, and ChatGPT/Codex fit together.

## Credit and Origin

Career-Ops was created by Santiago Fernández de Valderrama.

Original project:

`https://github.com/santifer/career-ops`

Original case study:

`https://santifer.io/career-ops-system`

This fork keeps the upstream architecture and much of the original documentation, but adds my operational layer and public-release cleanup around it.

Public fork:

`https://github.com/dawonderboy/career-ops-public-clean.git`

## What Career-Ops Does

Career-Ops turns job search work into a structured local pipeline:

- Evaluates jobs against your CV, profile, target roles, preferences, and proof points
- Generates tailored PDF resumes/CVs for roles worth applying to
- Scans supported job boards and ATS portals
- Tracks applications in markdown/TSV-backed local data files
- Produces evaluation reports and interview-prep material
- Keeps the human in control: the system can draft and prepare, but it should not submit applications for you

Important: this is not intended to be a spray-and-pray application bot. The point is filtering and quality control: fewer, better applications.

## My Part in the Codebase

The main contribution of this fork is operational integration rather than inventing the base product from scratch.

I used the upstream Career-Ops project as the job-search engine, then built a working environment around it so that multiple AI systems could collaborate safely:

1. Hermes Agent became the coordinator.
   Hermes handles persistent memory, tool use, scheduled jobs, repo-aware workflows, skills, and verification steps. Instead of manually remembering every command, Hermes reads the repo context and routes the task.

2. Claude Code became the implementation worker.
   Claude is used for bounded coding/debugging/documentation tasks where a strong coding model is useful. Hermes can delegate focused work to Claude instead of having the main conversation do everything.

3. ChatGPT/OpenAI Codex became the main reasoning layer.
   Hermes can run with ChatGPT/Codex as the primary model for orchestration, planning, prompts, review, and final synthesis.

4. The repo was adapted to run with agent instructions.
   `AGENTS.md` defines the operating contract for coding agents: data boundaries, tracker rules, setup checks, dashboards, job evaluation modes, and ethical use.

5. The React dashboard variant was preserved and documented.
   The repo includes both the original dashboard path and a React dashboard server at `web-dashboard.react.mjs` that serves the UI files from `mock/`.

6. Public-safety work was added.
   Private data such as CVs, trackers, reports, generated PDFs, OAuth files, ntfy topics, and application history should stay out of GitHub. The public repo should contain source, templates, example config, demo data, and docs only.

## How Hermes Is Built Into This Workflow

Hermes is not a single file inside Career-Ops. It is the orchestration layer that runs on top of the repository.

Career-Ops provides:

- `AGENTS.md` — repo-specific instructions loaded by compatible agents
- `CLAUDE.md` — Claude Code wrapper/context file
- `modes/*.md` — job-search modes such as evaluation, scanning, applying, PDF generation, tracker review
- `*.mjs` scripts — scanner, PDF generation, tracker merge, liveness checks, dashboard servers
- `data/`, `reports/`, `output/`, `interview-prep/` — local working data, usually gitignored/private

Hermes provides:

- tool execution
- memory and user preferences
- skill loading
- scheduled workflows
- browser and terminal verification
- multi-agent delegation
- model routing
- final user-facing coordination

In practice, Hermes reads the Career-Ops repo context, loads relevant skills, runs the right scripts, checks outputs, and tells the user what finished.

The important distinction:

- Career-Ops is the job-search application.
- Hermes is the operator that knows how to run it, verify it, and coordinate other AI tools around it.

## How I Made Hermes Work With Career-Ops

The integration pattern is:

1. Put Career-Ops in a normal local repo.
2. Keep repo-specific rules in `AGENTS.md`.
3. Keep personal job-search data in private/gitignored files.
4. Teach Hermes the operational workflow through skills and persistent memory.
5. Let Hermes call Node scripts, inspect markdown trackers, verify dashboards, and delegate code work when needed.

The workflow looks like this:

```text
User request
  ↓
Hermes Agent
  ↓
Loads Career-Ops context from AGENTS.md + relevant skills
  ↓
Chooses the right workflow
  ↓
Runs scripts / edits files / verifies state
  ↓
Delegates to Claude Code when bounded coding work is useful
  ↓
Uses ChatGPT/Codex for high-level reasoning and final synthesis
  ↓
Reports a clear completion status to the user
```

Examples of Hermes-controlled Career-Ops tasks:

- checking whether the repo is set up
- scanning portals for jobs
- evaluating a pasted job URL
- verifying whether a posting is still active
- generating a tailored PDF
- checking tracker/dashboard sync
- debugging the dashboard
- preparing interview materials
- running public-release checks before pushing to GitHub

## How Claude and ChatGPT/Codex Work With Hermes

The model split I used is deliberately practical:

| Layer | Tool/model | Role |
|---|---|---|
| Coordinator | Hermes Agent | Owns the task, tools, verification, memory, and final response |
| Main reasoning | ChatGPT / OpenAI Codex | Planning, synthesis, prompt strategy, review, orchestration decisions |
| Coding worker | Claude Code / Claude Sonnet | Focused code edits, debugging, implementation, repo-specific changes |
| Workflow app | Career-Ops | Job-search logic, scripts, modes, trackers, reports, dashboards |

This keeps the system from becoming a pile of disconnected AI chats. Hermes is the control plane. Claude and ChatGPT/Codex are model backends or workers depending on the job.

A sanitized example config is documented here:

`docs/HERMES-MULTI-MODEL-SETUP.md`

No private keys or OAuth files belong in this repo. Local credentials should live outside GitHub, such as in your Hermes config, provider auth files, or environment variables.

## Quick Start: Original Career-Ops Setup

```bash
# 1. Clone this public fork
git clone https://github.com/dawonderboy/career-ops-public-clean.git
cd career-ops-public-clean

# 2. Install dependencies
npm install
npx playwright install chromium

# 3. Check setup
npm run doctor

# 4. Create your private local config
cp config/profile.example.yml config/profile.yml
cp templates/portals.example.yml portals.yml

# 5. Add your private CV
# Create cv.md in the project root.
# Do not commit cv.md to a public repo.

# 6. Open your preferred agent in this directory
claude
# or run Hermes from this repo as your working directory
```

Then ask the agent to personalize the system, for example:

```text
Update my profile for Senior IT Support Engineer roles.
Change the archetypes to match corporate IT, executive support, desktop engineering, and endpoint tooling roles.
Add these companies to portals.yml.
Evaluate this job URL.
Generate a tailored PDF resume for this role.
```

## Quick Start: Hermes-Orchestrated Setup

This is the way this fork is intended to be operated locally.

1. Install and configure Hermes Agent outside this repo.
2. Configure Hermes with your preferred main model, such as ChatGPT/OpenAI Codex.
3. Configure Claude Code if you want Hermes to delegate coding/debugging tasks.
4. Start Hermes from the Career-Ops repo directory.
5. Let Hermes read `AGENTS.md` and follow the repo rules.

Conceptual example:

```bash
cd career-ops-public
hermes
```

Then ask Hermes for repo-aware actions:

```text
Check whether Career-Ops is fully set up.
Run the scan and tell me what changed.
Debug the React dashboard on port 3940.
Prepare this repo for public release.
```

Hermes should verify before reporting success. For example, if it starts a dashboard, it should check the port or API endpoint; if it creates tracker additions, it should run the merge and verification scripts.

## React Dashboard

This fork includes a React dashboard variant in addition to the original dashboard tooling.

The React dashboard server is:

`web-dashboard.react.mjs`

The UI files are in:

`mock/`

Important files:

```text
mock/Career Ops Dashboard.html
mock/ui-shell.jsx
mock/calendar-view.jsx
mock/pipeline-view.jsx
mock/progress-view.jsx
mock/scan-queue.jsx
mock/kanban-view.jsx
mock/drawer.jsx
mock/tweaks-panel.jsx
mock/data.js
```

To run it:

```bash
cd career-ops-public
node web-dashboard.react.mjs --host 0.0.0.0 --port 3940 --path .
```

Open:

```text
http://127.0.0.1:3940/
```

Depending on TLS configuration, you may also use:

```text
https://127.0.0.1:3940/
```

The original Node dashboard commonly runs on port `3737`. The React dashboard commonly runs on port `3940`.

## Terminal Dashboard

The original built-in terminal dashboard is still available:

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..
```

Features include filter tabs, sort modes, grouped/flat views, lazy-loaded previews, and inline status changes.

## Core Commands

```bash
npm run doctor        # validate prerequisites
npm run verify        # verify pipeline/tracker integrity
npm run normalize     # normalize tracker statuses
npm run dedup         # deduplicate tracker entries
npm run merge         # merge TSV tracker additions
npm run pdf           # generate PDFs
npm run scan          # run scanner entrypoint
npm run scan:providers
npm run scan:boards
npm run gemini:eval
```

Direct scripts of interest:

```bash
node web-dashboard.mjs --host 0.0.0.0 --port 3737 --path .
node web-dashboard.react.mjs --host 0.0.0.0 --port 3940 --path .
node verify-pipeline.mjs
node merge-tracker.mjs
node update-system.mjs check
```

## Data Boundaries

Keep private data out of GitHub.

Private/local files usually include:

```text
cv.md
config/profile.yml
modes/_profile.md
portals.yml
data/*
reports/*
output/*
interview-prep/*
.env
OAuth files
provider credential files
notification topics
```

Safe public files usually include:

```text
source code
sanitized templates
example config files
fictional demo data
docs
agent instructions that do not expose private data
```

## Project Structure

```text
career-ops-public/
├── AGENTS.md                    # Canonical agent instructions for this repo
├── CLAUDE.md                    # Claude Code context wrapper
├── GEMINI.md                    # Gemini CLI context wrapper, when used
├── docs/
│   └── HERMES-MULTI-MODEL-SETUP.md
├── modes/                       # Career-Ops workflow modes
├── config/
│   └── profile.example.yml      # Template; copy to private config/profile.yml
├── templates/
│   ├── cv-template.html
│   ├── cv-template.tex
│   ├── portals.example.yml
│   └── states.yml
├── data/                        # Private runtime tracker data, normally gitignored
├── reports/                     # Private/generated evaluation reports, normally gitignored
├── output/                      # Private/generated PDFs, normally gitignored
├── interview-prep/              # Private/generated interview prep, normally gitignored
├── dashboard/                   # Go terminal dashboard
├── mock/                        # React dashboard frontend files
├── web-dashboard.mjs            # Original web dashboard server
├── web-dashboard.react.mjs      # React dashboard server
├── scan*.mjs                    # Scanner scripts
├── generate-pdf.mjs             # PDF generation
├── verify-pipeline.mjs          # Integrity check
└── merge-tracker.mjs            # Safe tracker merge path
```

## How It Works

```text
Job URL or job description
  ↓
Career-Ops mode selection
  ↓
CV/profile/context read from private local files
  ↓
Job fit evaluation and report generation
  ↓
Optional tailored PDF generation
  ↓
Tracker addition written as TSV
  ↓
merge-tracker.mjs updates applications tracker
  ↓
verify-pipeline.mjs checks integrity
  ↓
Dashboard reflects tracker state
```

With Hermes in front:

```text
User request
  ↓
Hermes decides workflow and verifies prerequisites
  ↓
Career-Ops scripts/modes do the job-search work
  ↓
Claude Code may handle bounded implementation/debug tasks
  ↓
ChatGPT/Codex may handle high-level reasoning/review
  ↓
Hermes verifies and reports completion
```

## Gemini CLI Integration

Career-Ops also supports Gemini CLI usage. The original project includes Gemini command support and a standalone evaluation script.

Native Gemini CLI example:

```bash
npm install -g @google/gemini-cli
gemini auth
cd career-ops-public
gemini
```

Standalone API script example:

```bash
cp .env.example .env
# Set GEMINI_API_KEY in .env if using API mode.
npm install
node gemini-eval.mjs --file ./jds/my-job.txt
```

## Ethical Use

This system should help candidates make better decisions, not spam employers.

Rules of use:

- Do not auto-submit applications.
- Review every generated resume, answer, and message before sending.
- Avoid low-fit applications unless there is a specific reason to proceed.
- Respect ATS and job-board terms of service.
- Keep personal data local and private.

## Tech Stack

- Hermes Agent for orchestration, tools, memory, scheduling, and verification
- ChatGPT/OpenAI Codex as a main reasoning/model option
- Claude Code / Claude Sonnet as a coding and debugging worker option
- Node.js scripts for scanning, PDF generation, tracker integrity, and dashboards
- Playwright for browser automation and PDF generation
- Go + Bubble Tea/Lipgloss for the terminal dashboard
- Markdown/YAML/TSV as the local data layer
- React-style JSX files for the dashboard variant under `mock/`

## Also Open Source

Santiago's related portfolio project:

`https://github.com/santifer/cv-santiago`

If you need a portfolio to support your job search, that project is a useful companion to Career-Ops.

## Disclaimer

Career-Ops is a local, open-source tool, not a hosted service.

You control your data. Your CV, job history, application records, generated PDFs, and provider credentials should stay on your machine unless you explicitly choose otherwise.

You control the AI. The prompts and agent rules are designed to keep a human in the loop, but models can make mistakes. Always review generated content before using it.

You are responsible for complying with job-board, ATS, employer, and AI-provider terms of service.

See `LEGAL_DISCLAIMER.md` for the full legal disclaimer.

## License and Trademark

The code is licensed under the MIT License. The `career-ops` name and brand are governed by the upstream trademark policy in `TRADEMARK.md`.

## Maintainer Note for This Fork

This repository exists to show the public-safe version of my Career-Ops + Hermes operating setup. It should not contain private CVs, tracker history, interview notes, generated resumes, OAuth credentials, notification topics, or provider secrets.

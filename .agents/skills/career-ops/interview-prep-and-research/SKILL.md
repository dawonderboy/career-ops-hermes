---
name: interview-prep-and-research
description: "Process recruiter calls into structured interview prep materials. Research interviewer backgrounds via LinkedIn, analyze company strategy, build strategic talking points, and generate polished PDF interview guides with dark theme. Includes hiring manager intelligence gathering and question preparation workflows."
version: 1.0.0
---

# Interview Prep and Research

Use this skill when:
- A recruiter call/screen has been completed and you need to process the transcript into interview prep materials
- The user provides a hiring manager name/LinkedIn profile and wants strategic prep
- You need to convert interview prep materials to dark theme for offline study
- The next interview stage requires tailored prep based on interviewer background
- You're building multi-round interview strategies with different interview types (recruiter, HM, technical, fit)

## Core Workflow

### 1. Recruiter Call Intake & Processing

When user provides a call transcript:

1. **Extract key intelligence:**
   - Recruiter name and feedback tone
   - Advancement decision and reasoning
   - Specific performance signals mentioned (communication clarity, skill alignment, red flags)
   - Company context (team size, pain points, org structure)
   - Interview process (number of rounds, interviewers, timeline)
   - Compensation details (range, equity, timing)
   - Commute/location confirmations
   - Recruiter's assessment of your strengths (prioritize these — they're selling you to the hiring manager)

2. **Identify what worked:**
   - Which answers got positive feedback?
   - Which stories resonated?
   - What communication style did they praise or criticize?
   - What assumptions did they make about you that you should reinforce or correct?

3. **Flag advancement barriers:**
   - Did they mention any concerns (even softly)?
   - What's the gap between their first choice candidate and you?
   - What will they tell the hiring manager about you?

### 2. Hiring Manager Intelligence Gathering

**Research the hiring manager BEFORE writing prep materials.** This is the key differentiator.

**Data sources (in priority order):**
1. **LinkedIn** — Read their full profile carefully:
   - Job titles (trajectory: are they climbing, stable, or just moved?)
   - Tenure at current company (Is this their first month? Are they establishing themselves?)
   - Previous companies and roles (What's their background? Are they technical? Ops? Business?)
   - Connections (Who do they report to? Who reports to them?)
   - Posts/activity (What do they care about? AI? Operations? People leadership?)
   - Skills endorsements (What do peers think they're strong in?)
   - Recommendations (What do past colleagues say about them?)

2. **Company research:**
   - What is the company's mission/product? (Not just "they make X" — why does that matter?)
   - Who are the board/investors? (PE-backed? VC? Profitable? This shapes culture.)
   - Recent news (Are they fundraising? Acquired? Expanding? Struggling?)
   - Company values page (What do they claim to care about?)
   - Career blog (What kind of people do they hire?)

3. **Interview intelligence (if available):**
   - Glassdoor/Blind (take with grains of salt — anecdotal)
   - Recruiter's own hints (e.g., "Rhonda values execution, not just ideas")
   - Comparisons to your own experience (e.g., "This is similar to Apple's culture")

**What you're trying to answer:**
- What is this person's **charter** at this company? (Strategic? Build culture? Scale operations? Fix a specific problem?)
- What **type of leader** are they? (Visionary? Operator? Coach? Builder?)
- What **decisions** are they trying to make when they interview you? (Can you scale? Think strategically? Communicate clearly? Fit the team?)
- What **language** should you speak? (Data? Execution? AI/innovation? Operations? People?)

**Critical insight:** The hiring manager is not just evaluating you. They are solving a **business problem** by hiring someone for this role. Your job is to show you understand the problem and can help solve it.

### 3. Tailored Prep Material Structure

Create interview prep in `interview-prep/{Company} - {Role}/` with PDF filename:
```
{Your Name} - {Company} - {Role} - {Call-Type} Prep - {YYYY-MM-DD}.pdf
```

**Call-Type specificity matters.** Use exact labels:
- `Intro Conversation` (not "Intro Call")
- `Recruiter Screen` (not just "Screen")
- `Phone Screen` (if specified)
- `Hiring Manager` (for HM interviews)
- `Fit Call` (for culture/team fit rounds)
- `Technical Interview` (for technical depth rounds)
- `Right Fit` (company-specific term — be precise to the company's language)

**PDF-only final output.** No markdown or HTML artifacts in the folder.

### 4. Strategic Talking Points Framework

When building talking points, structure them as:

**For each likely question category:**

**Q: "Tell me about your experience with [X]"**
- Lead with impact, not chronology
- Use your strongest proof point first
- Map directly to what THIS interviewer cares about (based on their background)
- End with a forward-looking statement that connects to their problem

**Example structure:**
> "I've worked in high-growth tech environments where IT had to scale with the company. [Your strongest proof point showing scale/automation/exec support]. What I learned is [your philosophy aligned with their charter]. At [company], I did [specific outcome]. I'm excited about [this role] because [interviewer's mandate]."

**Critical rule:** Never script answers word-for-word. Practice out loud 1–2 times, then be natural. Authenticity beats perfection.

### 5. Multi-Round Interview Strategy

When the process involves 4+ interviews with different people:

1. **Prioritize Hiring Manager round:**
   - This is usually the most important (they make the hire/no-hire call)
   - Focus prep here first
   - Get recruiter's context on HM priorities before the interview

2. **Use recruiter's feedback cascade:**
   - If recruiter says "HM values execution," make sure every story shows you ship things
   - If recruiter says "HM is technical," prepare for technical depth questions
   - If recruiter says "HM is visionary," prepare to discuss strategy/impact

3. **Differentiate each round's purpose:**
   - **Recruiter:** Logistics, motivation, soft skills (communication, culture fit)
   - **Technical:** Depth in your domain (Windows/macOS/Okta/automation/AI)
   - **Hiring Manager:** Philosophy, scale thinking, decision-making under pressure
   - **Cross-functional/Exec:** Communication clarity, partnership ability, stakeholder thinking
   - **Fit call:** Chemistry, team values alignment, "would I want to work with this person?"

4. **Track advancement signals:**
   - After each interview, note what they said/asked in tracker
   - Use this to prep for the next round
   - Example: HM interview revealed they care about automation → technical interview probably tests automation depth

### 6. Dark Theme PDF Conversion

When user asks for dark theme interview materials:

**Current approach (proven):**
- Use Playwright to load existing PDFs
- Inject CSS with dark color scheme via `page.evaluate()`
- Emulate media colorScheme dark
- Re-export PDF with dark styling

**Dark theme color palette (standardized):**
```
Background:     #1a1a1a (off-black)
Text:          #e8e8e8 (light gray)
Accent:        #4da6ff (bright blue)
Header bg:     #003d99 (dark blue)
Header text:   #ffffff (white)
Borders:       #333333 (dark gray)
Table header:  #0d1f33 (navy)
Success:       #66cc99 (green)
Warning:       #ffcc66 (yellow)
```

**Batch conversion script pattern:**
1. Define hard list of PDF paths
2. Loop through each PDF
3. Use Playwright `browser.newPage()` + `emulateMedia({ colorScheme: 'dark' })`
4. Inject dark CSS via `page.evaluate()`
5. Export with `page.pdf()`
6. Report size and status

**Pitfall:** Large PDF batches (20+) take time. Show progress per file to user. Don't try to parallelize — Playwright works best sequential.

## Interview Prep by Interview Type

### Recruiter Screen (First Call)

**What they're evaluating:**
- Do you exist? (Are you a real candidate who applied/was referred?)
- Are you communicative? (Can you speak clearly about yourself?)
- Are you logistics-compatible? (Salary range, location, timeline, availability)
- Do you have the basic skills? (Your resume checks the boxes?)
- Are you motivated? (Do you actually want this role, or are you applying to everything?)

**Your goal:**
- Be clear and concise (not verbose — this is their feedback, take it seriously)
- Show authentic motivation for THIS company, not "any job"
- Confirm logistics (salary floor, location, start date, availability)
- Leave them wanting to introduce you to the hiring manager

**Key talking point:** Your 90-second "tell me about yourself" answer. This should hit: (1) relevant experience scale, (2) why it prepared you for this role, (3) what drew you to this company specifically. Practice it once, then be natural.

### Hiring Manager Interview

**What they're evaluating:**
- Can this person think strategically about my problem?
- Do they have judgment and good instincts?
- Can they communicate clearly with my stakeholders?
- Will they scale in this role, or just execute?
- Do I want to work with them?

**Your prep should:**
1. **Research the HM deeply** (LinkedIn, company structure, their charter)
2. **Answer the unspoken question:** "How will this person help me succeed in my role?"
3. **Lead with philosophy, not process** (Why you do things > How many tools you've used)
4. **Have 2–3 strong proof stories ready** (Preferably ones that align with their mandate)
5. **Ask smart questions** (Show you've researched them and the company)

**Key insight from this session:** When HM is a **strategic leader** (not just a manager):
- Don't oversell technical depth — they have engineers for that
- Sell strategic thinking, scaling mindset, automation philosophy
- Show you understand **organizational problems**, not just technical ones
- Mirror their language (If they talk about "AI enablement," use that term)
- Position yourself as a partner, not a subordinate

### Technical Interview

**What they're evaluating:**
- Do you have actual depth in the domain?
- Can you think systematically about problems?
- Do you know what you don't know?

**Your prep:**
- Have real examples (not just theoretical)
- Be ready to go deep or shallow based on interviewer's cues
- Know your strong spots and weak spots
- Practice talking through problems (not just having solved them)

### Fit/Culture Call

**What they're evaluating:**
- Will you mesh with the team?
- Do you understand the culture?
- Are you authentic or performing?

**Your prep:**
- Be yourself (this is where authenticity matters most)
- Show curiosity about the team/company
- Share genuine examples of working in similar cultures
- Ask about team dynamics, what they value, growth paths

## Pitfalls and Corrections

**Pitfall: Over-prepping leads to script delivery.**
When you've practiced an answer too many times, it comes out as memorized text. HMs can smell this immediately.

**Correction:** Practice talking points 1–2 times out loud, then stop. Go in with bullet points and themes, not word-for-word scripts. Authenticity beats polish.

---

**Pitfall: Researching the company but not the interviewer.**
You read the company's mission page but don't know anything about the person interviewing you.

**Correction:** Hiring manager background shapes the entire interview. Spend 5 min on their LinkedIn profile before the call. You'll have better questions and can tailor your answers.

---

**Pitfall: Not using recruiter's own feedback as a prep source.**
The recruiter told you what the HM cares about. You should use that directly.

**Correction:** After recruiter screen, ask (or note): "What did you tell [HM] about me?" or "What should I be prepared to dive deeper on?" Use their response to shape HM prep.

---

**Pitfall: Treating all interviewers the same.**
You give your "tell me about yourself" answer to the recruiter, HM, technical interviewer, and fit call interviewer in the same way.

**Correction:** Tailor the emphasis for each round. Recruiter wants motivation + logistics. HM wants philosophy + scale thinking. Technical wants depth. Fit wants authenticity.

---

**Pitfall: Dark theme PDF conversion loses content fidelity.**
When regenerating PDFs with dark CSS, margins, fonts, or table layouts can shift.

**Correction:** After dark conversion, spot-check a few pages in the PDF viewer. Ensure tables are readable, margins are preserved, and text is not cut off. Small Playwright tweaks (margin settings, format options) fix most issues.

## References

- `references/recruiter-call-transcript-analysis.md` — Detailed template for extracting intelligence from recruiter call transcripts, with real-world example
- `references/hiring-manager-linkedin-research.md` — How to profile a hiring manager from LinkedIn, identify their charter, and tailor your interview approach
- `references/interview-prep-dark-theme-css.md` — Dark theme color palette and Playwright CSS injection patterns for PDF batch conversion
- `references/multi-round-interview-strategy.md` — Differentiate recruiter vs HM vs technical vs fit call prep; track advancement signals across rounds
- `references/interview-talking-points-framework.md` — Structure proof stories and answers; avoid over-scripting; authenticity guidelines

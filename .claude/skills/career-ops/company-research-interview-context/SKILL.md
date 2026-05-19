---
name: company-research-interview-context
description: "Research a target company for interview context: mission, team, funding, partnerships, growth trajectory. Synthesize findings into a motivational narrative + PDF deliverable for pre-interview confidence and talking points."
version: 1.0.0
---

# Company Research for Interview Context

Use this skill when you have an interview scheduled and want to understand the company deeply enough to answer "Why do you want to work here?" with confidence and specificity.

This skill bridges your existing Career-Ops evaluation report (which covers role fit + CV match) with company-level research (mission, funding, partnerships, team, growth trajectory). The output is a **motivational narrative PDF** that answers: "Why does this company matter? Why should I be excited to work there?"

## Trigger conditions

- Interview is scheduled or about to be scheduled
- You want to move beyond "they have a nice office and good benefits" to genuine, mission-driven motivation
- The company has public materials (website, press releases, announcements, partnerships) that signal credibility
- You want talking points that aren't just CV-to-JD matching but genuine engagement with the company's problem/trajectory

## Workflow: 4 phases

### Phase 1: Gather public company facts (20–40 min)

1. **Start with the company’s own framing** (`browser_navigate`)
   - Look for: mission/purpose, values, what they build, who they serve
   - Capture: tone, maturity level (early-stage vs. established), and the exact language leadership uses to describe the business

2. **For public consumer or enterprise companies, use a stable source order**
   - Purpose / values / about page
   - Investor relations overview or annual report landing page
   - Latest earnings release or shareholder letter
   - Responsibility / ESG / sustainability hub
   - Executive team / governance page
   - Global footprint / locations page
   - Recent acquisition / strategy / product pages
   This order avoids over-indexing on marketing copy and works especially well when IR pages have older site structures or multiple redirects.

3. **Check "Updates" or "News" section** (if exists)
   - Recent announcements (past 6 months ideal)
   - Milestones, partnerships, funding rounds, product launches
   - Look for trajectory signals (Are they accelerating? Expanding? Pivoting?)

4. **Explore "Technology" or "How It Works" page** (if technical company)
   - Understand the core offering without needing a PhD
   - Identify defensibility: why this approach vs. alternatives?
   - For deep-tech: look for peer-reviewed papers, academic partnerships, credibility markers

5. **Try LinkedIn company page** (may require auth)
   - Company size, growth rate (headcount over time)
   - Recent hires, team strength signals
   - Employee testimonials if public

6. **Search for recent press/partnerships**
   - Major customer wins or partnerships announced
   - Industry recognition (awards, speaking slots, analyst coverage)
   - Funding announcements with investor names (signals who believes in them)

7. **Cross-reference your existing evaluation report**
   - Your Career-Ops report likely already contains company research (legitimacy assessment, comp data, market signals)
   - Pull out: founding date, funding raised, team context, business viability clues
   - Use it as a fact-checking baseline

**Pitfall:** Do not spend hours searching. If first-party sources (company website, recent press) are accessible, prioritize those. Blocked paywalls (Crunchbase, PitchBook, subscription news) are not worth fighting; fall back to what's publicly visible. If an IR page layout looks stale or confusing, route through the IR overview page, annual report landing page, or latest earnings release instead of assuming the company lacks current information.

### Phase 2: Identify the narrative threads (10–15 min)

Once you've gathered facts, distill them into 5–7 key threads:

1. **The company's mission/problem** — What real-world problem are they solving? Why does it matter?
2. **The timing** — Why now? What changed in 2022/2023/2024 that made this possible? (Breakthrough discovery, market shift, new regulation, investor appetite, etc.)
3. **The credibility** — What signals suggest they're not a lottery ticket? (Funding size, team pedigree, partnerships with credible institutions, published results, transparent roadmap)
4. **The growth trajectory** — Are they early (proving concept), mid (scaling), or late (established)? What's the expansion vector? (New offices, new products, new markets, new partnerships)
5. **Your role's relevance** — How does your specific IT/support/technical role enable their mission? (Not just "I'll fix tickets"; but "I'll help scale infrastructure so the team can focus on X")
6. **The honest risks** — What could go wrong? (Startup risk, market risk, execution risk, technical risk) — and why is that acceptable given the upside?
7. **The upside** — If they succeed, what does that mean? (Equity value, professional accomplishment, historical significance, learning opportunity)

**This is the synthesis step.** You're not writing a report yet; you're identifying the story threads so you know what to emphasize.

### Phase 3: Generate the narrative PDF (30–45 min)

1. **Structure the PDF** around the narrative threads from Phase 2, not a generic company-research template.
   - Start with a **one-minute thesis** (elevator pitch: "Why is this company NOT just another startup?" or "Why does this mission matter?")
   - Then explore each thread in order of credibility → impact → your fit
   - End with interview talking points and honest risks

2. **Use first-party sources only** in the PDF body
   - Quote the company website, press releases, transparency letters
   - If you pulled data from searches, state where it came from (e.g., "Company website states…", "March 12, 2026 transparency letter from COO states…")
   - Do NOT invent or speculate; if you're unsure about a fact, mark it as "unverified" or leave it out

3. **Structure for readability**
   - Use tables for comparisons (especially for hard-tech: your approach vs. competitors)
   - Use callout boxes for key facts that shouldn't be buried in prose
   - Keep paragraphs short (2–3 sentences max in PDF; longer in Markdown is fine)
   - Use visual hierarchy: one-minute thesis → key sections → subsections → bullet points

4. **Tailor the narrative to YOU**
   - Start with "Why is this company not a lottery ticket?" (credibility)
   - Pivot to "Why does their mission matter?" (impact)
   - End with "Why are you the right person for this role?" (fit)
   - The PDF should answer: "If I were interviewing this person, why should I be excited they want to work here?"

5. **Layer public research with existing Career-Ops context when the role is already tracked**
   - Read the tracker row, evaluation report, and any existing interview-prep packet before drafting
   - Use those repo sources for interviewer names, process details, internal tool hints, and prior fit analysis
   - Keep source layers explicit in the final PDF: first-party/public company facts vs. Career-Ops internal context from prior sessions
   - This avoids re-researching known interview context and makes the packet feel additive rather than redundant

6. **Generate as HTML → PDF via Playwright** (Playwright's PDF rendering is more consistent than browser print)
   ```bash
   node << 'NODEJS'
   import { chromium } from 'playwright';
   (async () => {
     const browser = await chromium.launch();
     const page = await browser.newPage();
     await page.goto('file:///path/to/rendered.html');
     await page.pdf({
       path: '/path/to/output.pdf',
       format: 'Letter',
       margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
       printBackground: true
     });
     await browser.close();
   })();
   NODEJS
   ```

7. **Cleanup temporary files**
   - Remove HTML, Markdown source, and any intermediate render scripts after PDF generation
   - Verify the final PDF exists and is non-empty before reporting success
   - Interview-prep folders should be PDF-only when done (per Robin's preference)
   - If the folder already contains stale `.md` research/prep artifacts from prior sessions, remove those too once the final PDFs are verified, so the folder returns to PDF-only state

8. **If the company is already tracked, update the tracker note with the new PDF path**
   - Append or replace the note text so the newest company-research packet is easy to find from `data/applications.md`
   - Preserve existing interview details, stage notes, and prep-PDF references while adding the company-research PDF

**Pitfall:** Do not generate a generic "company research report." Generate a **motivational narrative** — a document that answers "Why should I care?" and "Why am I excited about this?". The PDF should make the candidate (you) want to work there.

### Phase 4: Extract talking points for the interview (10 min)

1. **Your 45-second "Why this company?" answer**
   - Use the one-minute thesis
   - Reference 2–3 credibility signals (e.g., "proven science from 2022", "$900M funding", "partnerships with national labs")
   - Connect to your role (e.g., "scaling from 50 to 200 people means infrastructure mattering")

2. **Red-flag rebuttals**
   - If they ask "Are you okay with onsite?", "We're a startup, not Google", "Why not stay at your last company?"
   - Your answers should reference specific findings from the research (e.g., company growth timeline, mission relevance, skill fit)

3. **Smart questions to ask them**
   - Based on your research, what do you want to know about their plans?
   - Example: "I see you published a transparency letter in March. Can you walk me through where you stand on milestone 3 (net facility gain)?"
   - Example: "Your New Mexico expansion looks recent. What's the plan for IT infrastructure as you scale across two sites?"

## Output location and naming

Place the final PDF in your interview-prep folder following existing Career-Ops conventions:

```
interview-prep/{Company} - {Role}/
  └─ Robin Letim - {Company} - {Role} - Company Research - {YYYY-MM-DD}.pdf
```

Do NOT keep Markdown source, HTML render files, or scripts in the final folder. PDF only.

## Success criteria

- [ ] PDF is 6–10 pages, readable on screen and in print
- [ ] One-minute thesis clearly articulates why this company is NOT a lottery ticket
- [ ] Research is sourced (first-party website, press releases, published announcements)
- [ ] Your role's relevance is explained (not generic; specific to company's current growth phase)
- [ ] Honest risks are named + counterpoints provided (not just hype)
- [ ] Talking points are extractable (you could give the 45-second answer from memory after reading once)
- [ ] Interview-prep folder contains only the final PDF (no temp files)

## Pitfalls learned

- **Use the existing Career-Ops packet as a source layer.** If an interview is already in the tracker, there is often valuable context in the evaluation report, tracker notes, and prior prep PDF/Markdown that should be incorporated into the company-research packet. Public company research alone may miss interviewer mandate, internal-tool hints, or process nuance already captured elsewhere.

- **Finish the loop in the tracker.** A company-research PDF is much easier to reuse later if the application row points to it. Update the tracker note after generating the PDF instead of leaving the deliverable discoverable only by folder browsing.

- **Restore PDF-only folders, not just the new output.** If an interview-prep folder already contains stale Markdown source from a previous session, remove it after verifying the final PDFs. Robin prefers the final folder state to be PDF-only, not merely "the newest file is a PDF."

- **Paywalled sources are not worth fighting.** If you can't access Crunchbase or subscription news without paying, use first-party sources + public announcements instead. The best research comes from the company's own transparency (founders' letters, technical publications, partnership announcements).
  
- **Do not confuse "good sales pitch" with "credibility."** Sales pages are designed to convince. Look for: peer-reviewed publications, named partnerships with credible institutions, transparent roadmaps with realistic timelines (not hype), honest acknowledgment of what's left to prove.

- **"Timing" is often the overlooked thread.** Companies often exist for years before the moment is right. Pacific Fusion was founded in 2023, but the 2022 breakthroughs at national labs were the inflection point. Understanding the "why now?" makes the company story coherent and credible.

- **Company research should answer the interview question, not replace the evaluation report.** Your Career-Ops evaluation report answers "Am I a good fit for this role?" This research answers "Do I genuinely want to work for this company?" Both matter; they're different questions.

- **Browser navigation can stall on heavy pages.** Use `browser_snapshot` with `full=true` for accessibility tree extraction first; fall back to `browser_console` with `document.body.innerText` for plain text if the page is complex (especially common with modern React sites).

- **Cleanup matters.** After generating the PDF, explicitly remove temp HTML/Markdown files from the interview-prep folder. Robin prefers PDF-only deliverables; stray artifacts undermine that preference and can clutter the workspace.

## Related skills

- **career-ops-operations** — Governs the full job-search pipeline; this skill handles the pre-interview research layer
- **interview-prep-workflow** (from career-ops-operations) — Handles the actual prep document (STAR stories, likely questions, risk framing); this skill handles the *motivation* layer

## Templates and references

See `references/company-research-narrative-examples.md` for annotated examples (Pacific Fusion, 2026-05-05; LaunchDarkly, 2026-05-11).


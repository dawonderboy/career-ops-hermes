# Apply Pack: Resume Work History Ordering Pitfall

## Issue

When generating tailored resume PDFs for job applications, some resume PDF generators (including Career-Ops's PDF generation flow as of May 2026) reorder work history entries by **end-date descending** instead of **preserving the reverse-chronological order from cv.md**.

**Example failure (May 2026 Voleon case):**
- Expected order in cv.md (correct): Velocity Global (Jan 2024–Jan 2026) → Safetrust (Jun 2023–Nov 2023) → Santa Clara County (Feb 2023–Jun 2023) → Meta (Apr 2020–Nov 2022) → Google (Jan 2018–Mar 2020)
- Generated PDF order (wrong): Velocity Global → Meta → Google → Safetrust
  - Reason: PDF generator sorted by `end_date` descending: Jan 2026 > Nov 2022 > Mar 2020 > Nov 2023 (wrong)
  - Result: Santa Clara County and Safetrust appear out of order; looks like career backsliding

## Root Cause

The resume generation logic (likely in Claude Code's PDF templating or HTML-to-PDF conversion layer) parses work history from cv.md, then re-sorts entries by end-date without explicitly preserving input order. This is a bug in the PDF generator, not in cv.md itself.

## Detection Checklist

After generating a tailored resume PDF, **always verify work history order** before delivering to Robin:

**Fast method (browser console — preferred):** After navigating to the HTML source in the browser, run:
```js
Array.from(document.querySelectorAll('.job-company')).map(e => e.textContent.trim())
```
Returns the ordered company list directly. Faster and more reliable than vision or snapshot inspection.

**Headless/source method:** If using terminal-only verification against saved HTML, extract only the structured job-company elements, not raw substring positions:
```python
import re
from pathlib import Path
s = Path('output/Company - Role/cv-company-role.html').read_text()
actual = re.findall(r'<span class="company">(.*?)</span>', s)
expected = ['Velocity Global/Pebl', 'Safetrust', "Santa Clara County District Attorney's Office", 'Meta', 'Google']
print('WORK_HISTORY_ORDER_OK', actual == expected)
```
Do **not** verify order with naive `s.index('Meta')` / `s.index('Google')` across the whole HTML. Those names can appear earlier in the summary, contact links, skills, or prose and create false failures even when the rendered work-history section is correct.

**Manual method:** Open the generated PDF, locate the "Professional Experience" section, read job titles top-to-bottom.

Cross-check against cv.md order — should be most-recent-first.

**Expected order for Robin (as of May 2026):**
   - Velocity Global/Pebl (Jan 2024 – Jan 2026) ← most recent
   - Safetrust (Jun 2023 – Nov 2023)
   - Santa Clara County District Attorney's Office (Feb 2023 – Jun 2023)
   - Meta (Apr 2020 – Nov 2022)
   - Google (Jan 2018 – Mar 2020) ← oldest

## Workaround

**If wrong order detected in generated PDF:**
1. **Do NOT deliver the PDF as-is** — wrong work history order signals disorganization to recruiters
2. Regenerate the resume PDF using the same generation tool
3. If the bug persists, try a different rendering approach:
   - Switch resume generator (e.g., from Playwright HTML→PDF to LaTeX)
   - Manually re-order entries in the HTML template before conversion
   - Export as markdown first, verify order, then render to PDF
4. Verify the new PDF before delivering

## Prevention

When you generate a tailored resume for a company:
1. **After PDF is created**, spot-check the work history order in the PDF
2. If order looks wrong (jobs appear shuffled or newest doesn't come first), regenerate
3. Report any persistent ordering issues to the development log so the generator can be patched

## Notes

- This bug was discovered in May 2026 during Voleon resume generation
- The impact is **moderate-to-high**: wrong work history order looks like a red flag to hiring managers
- The fix likely requires patching the PDF generation logic to preserve input order explicitly (use array order, not re-sort by date)
- Workaround is simple (regenerate or use alternate tool) but requires manual verification each time

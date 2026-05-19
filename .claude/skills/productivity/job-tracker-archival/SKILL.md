---
name: job-tracker-archival
description: "Archive expired/closed job postings in tracker instead of deleting. Preserves historical data for reporting, trend analysis, and hiring pattern metrics."
version: 1.0.0
---

# Job Tracker Archival Strategy

When cleaning up a job tracker (e.g., removing expired postings), **archive instead of delete**. Historical data enables reporting on hiring trends, location demand, company patterns, and job market changes over time.

## When to Archive

Archive a job posting when:
- Posting is expired (404, Greenhouse/Ashby API error, URL redirect)
- Job closed without application (posting removed, company hiring freeze)
- Application was never submitted (skipped due to location, level, comp mismatch)

**Do NOT archive:**
- Jobs with active applications or interviews (move to separate "Offers" or "Pipeline" section)
- Jobs with rejections or offers (move to "Outcomes" section)

## Archive Structure

Create a dedicated section at the end of tracker with:

```markdown
## ARCHIVED — Expired/Closed Postings (No Applications)

*These X postings were expired, closed, or had posting errors when last checked. 
None received applications. Archived for reporting, trend analysis, and potential repost monitoring.*

| # | Date | Company | Role | Score | Reason |
|---|------|---------|------|-------|--------|
| 273 | 2026-05-06 | AllTrails | IT Engineer II | 3.6/5 | Posting closed/expired — verify on Lever if reposted |
| 274 | 2026-05-06 | Sumo Logic | Senior IT Systems Engineer | 3.8/5 | Salary not disclosed — AWS req unconfirmed |
| ... | | | | | |
```

### Reason Code Examples

Use concise, consistent reason codes:

- **API Errors:** `Greenhouse 404`, `Lever API 404`, `Ashby UUID not found`, `GraphQL null`
- **Posting Closed:** `Posting closed`, `Redirect to main board`, `URL returns empty`, `Not on company careers page`
- **Location Blocker:** `Berlin unconfirmed`, `Warsaw Poland required`, `Sydney AU`, `London UK`
- **Company Issues:** `Layoffs`, `Red flags (Glassdoor 3.3)`, `Funding delays`
- **Unconfirmed Details:** `Salary not disclosed`, `Location unconfirmed`, `Role scope unclear`
- **Comp Floor:** `Below $100K floor`, `CAD currency below USD minimum`

## Archival Format

Keep rows minimal but traceable:

```markdown
| # | Date | Company | Role | Score | Reason |
| 273 | 2026-05-06 | AllTrails | IT Engineer II | 3.6/5 | Posting closed — verify Lever for repost |
| 274 | 2026-05-06 | Sumo Logic | Senior IT Systems Engineer | 3.8/5 | Salary unconfirmed, AWS req unclear |
| 256 | 2026-05-05 | Zoom | IT Support Specialist | 3.6/5 | Greenhouse 404 — posting closed |
```

Score is preserved (useful for: if job reposts, know its quality assessment). Date is the scan date (useful for: tracking job market timing).

## Uses for Archive

With a well-maintained archive, you can generate:

1. **Hiring trend reports:**
   - "X companies posted in Feb, Y in March" → hiring pace
   - "Tech company hiring on AV engineers dropped 60% Q1→Q2" → market signal
   - "60% of remote IT roles in Bay Area vs 10% in 2024" → market shift

2. **Company-specific intelligence:**
   - "Huntress, Mercury, 1Password all closed same month" → org change?
   - "Okta reposted Senior Platform Engineer 3x in 6mo" → hard-to-fill role

3. **Location demand:**
   - "78 archived = India (45), Canada (20), EU (13)" → % of postings outside target
   - "100% of remote SaaS support roles were non-US" → geographic reality check

4. **Repost monitoring:**
   - Companies that close roles sometimes repost weeks/months later
   - Search archive by company name to see prior versions
   - Example: "#236 Huntress expired 2026-05-04 (4.6/5) — watch for repost"

## Implementation

When cleaning tracker:

```bash
# 1. Identify candidates for archival
grep "Discarded\|SKIP" data/applications.md | grep -E "Expired|Closed|404|redirect" > /tmp/archive_candidates.txt

# 2. Create ARCHIVED section at end of applications.md

# 3. Move rows to archive section with reason codes

# 4. Verify no applied/interviewed jobs are deleted (check Status column)

# 5. Count archived entries for reporting
# Example: "Removed 78 expired/closed postings (never applied). Archive preserved for trend analysis."
```

## Sample Archive Entry Format

```markdown
| 256 | 2026-05-05 | Zoom | IT Support Specialist | 3.6/5 | Greenhouse 404 — posting closed; strong CV match but re-post monitoring recommended |
```

Full context in reason field: status + quality + action (if any).

## References

- Career-Ops Tracker: `data/applications.md`
- Archive example (May 2026): Bottom of `data/applications.md` with 78 entries

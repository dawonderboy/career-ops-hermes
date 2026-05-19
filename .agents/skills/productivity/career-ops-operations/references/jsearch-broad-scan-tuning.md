# JSearch broad-scan tuning (May 2026)

Use this when the job-board aggregator scan is intended for broad discovery and JSearch is available.

## Working pattern
- Use JSearch as the primary broad-discovery source.
- Use ATS/company APIs for verification and follow-up evaluation.
- Avoid enabling multiple RapidAPI mirrors for the same discovery surface unless you have a specific reason.

## Why this helps
- JSearch fans out across many boards, so it already covers much of the discovery footprint.
- Duplicate RapidAPI mirrors (for example Glassdoor/ZipRecruiter/LinkedIn mirrors) can burn quota twice and trigger 429s without improving yield.

## Tuning that helped in this session
- Query the strongest role families, not generic IT-support text:
  - Executive IT Support
  - Executive Support Engineer
  - Senior IT Support Engineer
  - Corporate IT
  - Workplace Technology
  - Employee Technology
  - Client Platform Engineer
  - Endpoint Engineer
  - macOS Engineer
  - Jamf Engineer
  - Intune Administrator
  - Concierge IT
  - White Glove
- Keep JSearch `num_pages: 1` unless you have spare quota.
- Use a longer stagger/cooldown window when RapidAPI is shared with other scanners.
- Disable redundant mirror boards when JSearch is already acting as the discovery layer.

## Failure mode to watch
- If JSearch returns HTTP 429, treat it as a cooldown signal and rerun later rather than hammering the endpoint with immediate retries.
- If the result set is empty, check whether the query is too broad or whether cooldown throttled the run before discovery could happen.

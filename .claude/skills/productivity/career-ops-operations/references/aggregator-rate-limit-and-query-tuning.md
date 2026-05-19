# Aggregator rate-limit + query tuning (May 2026)

Use this when `scan-job-boards.mjs` is producing RapidAPI 429s, high junk volume, or repeated re-hits on the same failing boards.

## Proven changes

### Scanner-side protections
- Lower global concurrency for job-board scans when RapidAPI boards are enabled (`CONCURRENCY = 2` worked better than 5/3).
- Add exponential backoff for `HTTP 429`, `5xx`, and aborted requests.
- Respect `Retry-After` when present.
- Persist per-board cooldown state to `data/job-board-cooldowns.json`.
- On a 429, skip the board on later scans until cooldown expires instead of immediately retrying every run.
- Add per-board `stagger_ms` so RapidAPI boards are not all hit at once.

### Config-side tuning in `portals.yml`
Use narrower role-family queries instead of generic `IT Support`.
Effective title families for Robin were:
- `Executive IT Support`
- `Executive Support Engineer`
- `Senior IT Support Engineer`
- `Corporate IT`
- `Workplace Technology`
- `Client Platform Engineer`
- `Endpoint Engineer`

Additional tuning that reduced junk:
- Reduce JSearch-family `num_pages` from 2 to 1.
- Reduce LinkedIn `count` from 100 to 40.
- Reduce Adzuna `results_per_page` from 50 to 35.
- Give the most 429-prone boards longer stagger/cooldown windows.

## Example per-board cooldown profile
- `indeed_scraper`: `stagger_ms: 8000`, `cooldown_minutes: 120`
- `jsearch`: `stagger_ms: 2500`, `cooldown_minutes: 45`
- `glassdoor`: `stagger_ms: 5000`, `cooldown_minutes: 45`
- `ziprecruiter`: `stagger_ms: 7500`, `cooldown_minutes: 45`
- `linkedin_job_search`: `stagger_ms: 10000`, `cooldown_minutes: 180`

## Observed outcome
Before tuning:
- ~70 jobs found
- ~62 title-filter removals
- repeated 429s on Indeed scraper + LinkedIn Job Search

After tuning:
- 3 jobs found
- 0 title-filter removals
- glassdoor aborts disappeared
- Indeed scraper and LinkedIn could still 429, but now they enter cooldown and stop getting hammered

## Important caveat
Narrower aggregator queries can still surface semantically adjacent false positives (for example `Manager, Workplace Technology` or architect-heavy roles). After tuning the board queries, keep title negatives and pipeline review in place; query narrowing reduces junk but does not replace fit review.

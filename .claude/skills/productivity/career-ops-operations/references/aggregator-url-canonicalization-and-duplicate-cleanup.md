# Aggregator URL canonicalization and duplicate cleanup

Use this when a scan appears to add a new pending job from an aggregator, but the role is actually a previously processed/expired posting with a fresh tracking URL.

## Failure pattern

Some aggregators, especially Adzuna landing URLs, generate many distinct URLs for the same underlying job by changing query parameters such as `se=...` while keeping the same path and stable `v=...` token.

Example pattern:

```text
https://www.adzuna.com/land/ad/5711232382?se=<changes>&utm_medium=api&utm_source=...&v=<stable>
```

The scanner may treat these as new exact URLs even when `data/pipeline.md` already contains the same base posting marked expired, skipped, evaluated, or processed.

## Triage steps

1. After `npm run scan`, do not trust the console's `New offers added` count alone.
2. Inspect the newest pending lines in `data/pipeline.md` and newest `data/scan-history.tsv` rows.
3. For aggregator URLs, compare canonical identity before treating a result as new:
   - Adzuna: scheme + host + path, plus stable `v` token when present; ignore volatile `se` and tracking params.
   - LinkedIn/Ever Jobs: job ID in path is usually the canonical identity.
   - Greenhouse/Lever/Ashby direct URLs: job ID/path is usually canonical.
4. Search `data/pipeline.md`, `data/applications.md`, and recent `data/scan-history.tsv` for the same company + title and canonical job identity.
5. If the prior record is clearly the same role and already expired/processed, treat the scan addition as a duplicate rather than an actionable pending item.

## Safe cleanup pattern

When a duplicate aggregator result was added as pending:

1. Patch only the newly added pending lines in `data/pipeline.md` from unchecked pending to checked SKIP, preserving the URL for audit:

```text
- [x] SKIP | <url> | <Company> | <Title> | skipped_dup: same <canonical role> already processed/expired <date>
```

2. Patch the corresponding newest `data/scan-history.tsv` rows from `added` to `skipped_dup`.
3. Do not create tracker rows for these duplicates.
4. Run `node verify-pipeline.mjs`.
5. Confirm there are no unchecked pending list items unless unrelated pending jobs remain.

## Reporting

In the final scan summary, distinguish between raw scanner additions and actionable additions:

- Say the scanner surfaced the role, but it was cleaned up as a duplicate if applicable.
- Report the final actionable pending count after cleanup.
- Mention any remaining verification warnings separately from scan success.

## Pitfalls

- Do not delete duplicate aggregator lines outright; mark them checked/SKIP so scan-history and pipeline audit trails remain explainable.
- Do not mark a duplicate as expired unless the previous record or fresh liveness check proves closure. If the only proof is same canonical URL as a processed/evaluated role, use `skipped_dup`.
- Do not evaluate a repeated aggregator landing URL when the same underlying role already has a report or a clear expired annotation.

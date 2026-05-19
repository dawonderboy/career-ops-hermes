# Pipeline pre-dedup before delegation

Use this when processing pending pipeline items, especially when multiple pending jobs will be delegated for extraction/evaluation.

## Lesson

Before launching worker/delegate tasks, pre-deduplicate pending items against `data/applications.md` and existing processed `data/pipeline.md` rows by company + normalized role title, not just exact URL.

Aggregators and LinkedIn often resurface the same job under a new URL or job ID. If the same company + role already has a valid report/tracker row, do not spend a worker slot re-evaluating it and do not create a new TSV.

## Suggested sequence

1. Read pending `- [ ]` rows from `data/pipeline.md`.
2. For each pending row, extract available company and role from the pipeline columns.
3. Search `data/applications.md` for same company + same/synonymous role title.
4. Search processed rows in `data/pipeline.md` for same company + role and existing report ID.
5. Classify before delegation:
   - exact prior report/tracker match → mark pending row as checked duplicate/SKIP and reference the existing report number.
   - same company but meaningfully different title/scope → evaluate normally.
   - uncertain match → delegate extraction/evaluation, but flag as possible duplicate in the worker context.
6. Only delegate net-new or uncertain roles.
7. After processing, run `node merge-tracker.mjs` if TSV additions were created, then `node verify-pipeline.mjs`.

## Duplicate pipeline row format

```text
- [x] SKIP #<existing-id> | <url> | <Company> | <Role> | duplicate of evaluated report #<existing-id> (<score>/5); same role repost/source URL
```

If the prior item was expired or skipped rather than evaluated, use a clear audit note such as:

```text
- [x] SKIP | <url> | <Company> | <Role> | skipped_dup: same role already marked expired <date>
```

## Pitfalls

- Do not create a new tracker row for a role already evaluated under another URL.
- Do not run costly extraction workers on obvious duplicates; save delegation for net-new or uncertain roles.
- Do not rely on exact URL matching for LinkedIn or aggregator URLs. Company + role + canonical job identity is usually more reliable.
- Do not delete duplicate pending rows; mark them checked/SKIP so the audit trail explains why they were not evaluated.

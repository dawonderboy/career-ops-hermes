# Pending URL liveness sweeps

Use this when the user asks to go through pending jobs and mark inactive URLs as discarded.

## Best workflow

1. Build a flat URL list from `data/pipeline.md`, scoped to the `## Pendientes` section only.
2. Run the built-in Playwright checker in batch mode:

```bash
node check-liveness.mjs --file /tmp/career_ops_pending_urls.txt
```

Suggested helper to generate the file:

```bash
python3 - <<'PY'
from pathlib import Path
import re
text = Path('data/pipeline.md').read_text()
start = text.index('## Pendientes')
end = text.index('## Processed')
section = text[start:end]
urls=[]
for line in section.splitlines():
    s=line.strip()
    if not s.startswith('- ['):
        continue
    m=re.search(r'https?://\\S+', s)
    if m:
        urls.append(m.group(0))
Path('/tmp/career_ops_pending_urls.txt').write_text('\\n'.join(urls)+'\\n')
print(f'wrote {len(urls)} urls')
PY
```

3. Treat `expired` as safe to mark closed.
4. Treat `uncertain` as manual-review candidates unless the page is already clearly expired from stronger evidence.
5. Update only existing state:
   - existing rows in `data/applications.md` for tracked rows
   - existing discovery lines in `data/pipeline.md` for pending items
   Do not create brand-new tracker rows during a liveness sweep.
6. Preserve historical reporting: do not delete rows; convert status/notes to `Discarded` or closed annotations.

## Status/result handling

- `expired` examples worth recording directly in notes:
  - Ashby: `job not found`
  - Greenhouse: redirect to `?error=true`
  - Lever: HTTP 404
  - nav/footer-only content: treat as closed if the page no longer contains JD body
- `uncertain` examples that should usually remain untouched until reviewed:
  - Workday pages with content but no visible apply button
  - LinkedIn/Indeed aggregator pages with body text but no reliable apply control

## File-specific notes

### applications.md

- If the row is still `Evaluated` and the posting is now expired, change status to `Discarded`.
- If already `Discarded`, keep the status and strengthen the note with the concrete liveness result.
- If an archived closed-postings table exists inside `data/applications.md`, it must use the same 9-column tracker contract. If it still uses the old 6-column schema, load `references/tracker-archived-section-normalization.md` before editing.

### pipeline.md

- For still-pending discoveries, flip the checkbox marker from `[x]` to `[!]` when the Playwright re-check confirms closure.
- Add the concrete closure reason and re-check date inline.
- Keep active items unchanged.
- For `SKIP` rows that are also now closed, annotation is fine but do not create extra tracker churn.

## Pitfalls

- Do not auto-discard `uncertain` results just because there is no visible apply control.
- `verify-pipeline.mjs` errors from archived expired-postings rows indicate tracker-format debt, not an acceptable steady state. Do not hide or ignore them; either normalize the archived section with `references/tracker-archived-section-normalization.md` or report the pre-existing debt separately from the sweep result.
- `git diff` may be empty if files are intentionally untracked or already in the current working tree state; verify with direct reads of the edited lines.

# Tracker Patching Pitfall: mcp_Patch Newline Escaping

## Safety boundary

Current tracker write contract:

Net-new tracker entries must not be written directly to `data/applications.md`.

For brand-new roles:

1. Create TSV additions under `batch/tracker-additions/`.
2. Run `node merge-tracker.mjs`.
3. Run `node verify-pipeline.mjs`.

Direct edits to `data/applications.md` are allowed only for updating existing rows/status/notes when an explicit workflow permits it.

Adding brand-new roles directly to `data/applications.md` is forbidden, even for small batches.

This reference is only for repairing or updating existing tracker rows/status/notes when a workflow explicitly permits direct `data/applications.md` edits. It is not approval to create net-new tracker rows directly.

## The Problem

When using `mcp_Patch` to modify existing tracker rows in `data/applications.md` that contain long notes or escaped newlines, the tool can escape newline characters as literal `\n` instead of actual newlines in the file.

Result: Markdown table parsing breaks. Dashboard parsers check `if (!line.startsWith('| '))` and can silently reject malformed rows, making companies invisible in the UI even though text exists in the tracker.

## Historical failure example (do not repeat as a creation pattern)

Older workflows attempted to add CZI #284 via `mcp_Patch` and produced literal escaped newlines:

```text
|||---|------|---------|------|-------|--------|-----|--------|-------|\n|| 284 | 2026-05-07 | Chan Zuckerberg Initiative | ...
```

That direct-add pattern is obsolete. Net-new rows now go through TSV additions plus `node merge-tracker.mjs`.

## Column Order Pitfall (direct mcp_Patch updates to existing rows)

When using `mcp_Patch` to update an existing tracker row — for example to add PDF emoji or update notes after an apply pack is generated — it is easy to silently write the columns in the wrong order even though the row already exists.

The tracker column order is: `# | Date | Company | Role | Score | Status | PDF | Report | Notes`

Score comes BEFORE Status. The merge script handles the swap for TSV additions, but direct mpc_Patch edits do NOT go through merge — the order you write is the order that lands in the file.

Failure pattern observed (May 2026): when updating row #386 via direct mcp_Patch, the new string was written as `Evaluated | 3.8/5` (status-before-score) instead of `3.8/5 | Evaluated` (score-before-status). verify-pipeline.mjs caught it with:
```
❌ #386: Non-canonical status "3.8/5"
❌ #386: Invalid score format: "Evaluated"
```

Prevention: before writing the replacement string, re-read the column header in `data/applications.md`:
```
| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
```
and confirm your replacement string matches that order exactly. Score (e.g. `4.2/5`) must appear in column 5, Status (e.g. `Evaluated`) in column 6.

Always run `node verify-pipeline.mjs` immediately after any direct tracker patch — it will catch the swap immediately.

```bash
# Check what actually made it into the file
grep "<row-id-or-company>" data/applications.md | head -1

# If you see literal 
 or \n in the affected existing row, repair the escape sequence carefully
python3 << 'PY'
from pathlib import Path
p = Path('data/applications.md')
content = p.read_text()
p.write_text(content.replace('|\n|', '|
|'))
PY

node verify-pipeline.mjs
curl -s http://127.0.0.1:3737/api/state | jq '.apps | length'
```

Use this only for existing-row repair. Re-read the affected region before and after.

## Solution 2: For brand-new rows, use TSV additions instead

For net-new tracker entries, do not patch or write `data/applications.md` directly. Use:

1. `batch/tracker-additions/{num}-{slug}.tsv`
2. `node merge-tracker.mjs`
3. `node verify-pipeline.mjs`

Example TSV line:

```text
284	2026-05-07	Chan Zuckerberg Initiative	Senior IT Support Engineer	Evaluated	4.5/5	✅	[284](reports/284-chan-zuckerberg-initiative-2026-05-07.md)	Evaluated 2026-05-07 — strong role fit; see report.
```

## Prevention Checklist

After any permitted existing-row tracker update:

1. Grep the affected row: `grep "<row-id-or-company>" data/applications.md | head -1`.
2. Look for literal `
` or `\n` in the output.
3. Confirm the row starts with a single `| `, not `||`.
4. Run `node verify-pipeline.mjs`.
5. Check dashboard API sees the row:
   ```bash
   curl -s http://127.0.0.1:3737/api/state | jq '.apps | map(select(.company == "<Company>")) | length'
   ```
6. If API returns 0 but tracker text exists, load `tracker-dashboard-sync-pitfalls.md` and `tracker-formatting-pitfall-double-pipe.md`.

## Related

- `tracker-formatting-pitfall-double-pipe.md` — rows starting with `||` instead of `|` are rejected.
- `tracker-dashboard-sync-pitfalls.md` — broader tracker/dashboard sync diagnosis.
- `pipeline-report-numbering-and-tracker-append.md` — current report numbering + TSV addition workflow.

# Tracker Formatting Pitfall: Double-Pipe Escaping in mcp_Patch

## Safety boundary

Current tracker write contract:

Net-new tracker entries must not be written directly to `data/applications.md`.

For brand-new roles:

1. Create TSV additions under `batch/tracker-additions/`.
2. Run `node merge-tracker.mjs`.
3. Run `node verify-pipeline.mjs`.

Direct edits to `data/applications.md` are allowed only for updating existing rows/status/notes when an explicit workflow permits it.

Adding brand-new roles directly to `data/applications.md` is forbidden, even for small batches.

This reference is for repairing row formatting after permitted existing-row edits. It is not approval to create new rows directly.

## Problem

When using `mcp_Patch` to replace existing Markdown table rows in `data/applications.md`, the tool may add extra pipe characters at the row start.

Expected:

```text
| 270 | 2026-05-06 | Netflix | ...
```

Observed:

```text
|| 270 | 2026-05-06 | Netflix | ...
```

This is a tool escaping/context side effect, not user error.

## Impact

Both Node (`web-dashboard.mjs`) and React (`web-dashboard.react.mjs`) dashboard parsers silently reject rows that do not match `line.startsWith('| ')`. Double-piped rows are skipped entirely: no error, no warning, just missing from the dashboard.

## Solution for existing malformed rows

After any permitted `mcp_Patch` operation on tracker rows:

1. Verify single-pipe format:

   ```bash
   grep "^| " data/applications.md | grep <company-name>
   ```

   If no output but the company exists in the file, check for double pipes.

2. Identify affected rows:

   ```bash
   grep "^|| " data/applications.md | head -3
   ```

3. Repair only the malformed existing row, using enough exact context to avoid accidental replacements:

   ```text
   old_string: "|| 270 | 2026-05-06 | Netflix | ..."
   new_string: "| 270 | 2026-05-06 | Netflix | ..."
   ```

4. Verify:

   ```bash
   node verify-pipeline.mjs
   curl -s http://127.0.0.1:3737/api/state | jq '.apps | map(select(.company == "Netflix"))'
   ```

## When This Happens

- When modifying existing tracker rows with `mcp_Patch`.
- Historical note: this also happened during old direct-add evaluation batches; do not repeat that pattern.
- Especially common when replacing multiple rows in one patch or using context that starts near a Markdown table separator.

## Prevention

For brand-new tracker additions, do not patch or append `data/applications.md` directly. Write TSV files under `batch/tracker-additions/`, run `node merge-tracker.mjs`, then run `node verify-pipeline.mjs`.

When modifying existing rows with `mcp_Patch`, include the full row and surrounding context, then re-read the affected region before reporting success.

## Session Example

May 6, 2026: CoreWeave (#269) and Netflix (#270) entries were historically added with an obsolete direct-row pattern and initially had `||` prefixes. Dashboard queries returned 0 results. The repair was changing row prefixes to single `| ` and verifying dashboard API visibility. Current net-new entries must use TSV + merge instead.

## See Also

- `tracker-dashboard-sync-pitfalls.md` — broader dashboard sync issues.
- `tracker-patch-escaping-pitfall.md` — escaped newline corruption.
- `pipeline-report-numbering-and-tracker-append.md` — current TSV addition workflow.

# Update + scan verification quirks

Small but reusable quirks observed during a May 2026 Career-Ops maintenance session.

## 1) Updater can print a non-fatal git pathspec error

Observed during:

```text
node update-system.mjs apply
```

Output included:

```text
error: pathspec '.gemini/commands/' did not match any file(s) known to git
Update complete: v1.6.0 → v1.7.0
```

Interpretation:
- Do not assume the update failed just because that stderr line appeared.
- Treat it as non-fatal if the updater still reports `Update complete`.
- Immediately verify with:

```bash
node update-system.mjs check
node verify-pipeline.mjs
```

In the observed case, `check` returned `up-to-date` and pipeline verification stayed clean.

Likely cause:
- the updater expected `.gemini/commands/` from upstream, but that path was absent from the local repo layout/history.

## 2) scan.mjs summary count can disagree with repo state

Observed during a scan where console output said:

```text
New offers added: 1
```

But repository state showed two actual additions:
- one new pending item in `data/pipeline.md` for Box
- one new pending item in `data/pipeline.md` for Verkada
- matching `added` rows in `data/scan-history.tsv`

Verification steps when the summary looks suspicious:

```bash
sed -n '1,20p' data/pipeline.md
# or rg '^- \[ \]' data/pipeline.md

tail -20 data/scan-history.tsv
```

Interpretation:
- trust the file-level state over the console summary when they conflict
- report the mismatch explicitly so Robin knows whether the queue really changed
- if needed, sanity-check location/filter behavior before spending time on evaluation

## Practical reporting pattern

When scan output and repo state disagree, summarize both:
- scanner console summary
- actual pending queue count / added URLs from `data/pipeline.md`
- actual `added` rows in `data/scan-history.tsv`
- whether `node verify-pipeline.mjs` stayed clean

# Scan target classification

Use this when a user asks what places were scanned or wants a scan recap.

Key rule:
- `scan.mjs` scans the enabled `tracked_companies` entries whose `scan_method` is not `websearch`, plus the configured aggregator feeds.
- `websearch` / manual-only entries are still useful for discovery and tracking, but they are not part of the zero-token API scan unless the scanner is extended.

Suggested reporting format:
1. Scanned targets by provider/ATS: Greenhouse, Ashby, Lever, validated Workday.
2. Manual/websearch-only tracked companies: mention separately as not scanned in this run.
3. Aggregator feeds: report separately from direct company boards.

Useful inspection commands:
```bash
python3 - <<'PY'
import yaml
from pathlib import Path
obj = yaml.safe_load(Path('portals.yml').read_text())
tracked = obj.get('tracked_companies', [])
api_targets = [c for c in tracked if c.get('enabled', True) and c.get('scan_method') != 'websearch']
manual_targets = [c for c in tracked if c.get('enabled', True) and c.get('scan_method') == 'websearch']
print('api_targets:', len(api_targets))
print('manual_targets:', len(manual_targets))
PY
```

Pitfall:
- Do not present the full `portals.yml` company list as the scan result. The scan result should reflect what `scan.mjs` actually consumed in that run.

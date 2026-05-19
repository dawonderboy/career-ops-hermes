# Zero-token provider expansion notes

Use this when extending `scan.mjs` beyond Greenhouse/Ashby/Lever or when a tracked company has an explicit `api` field but is still skipped.

## Learned in session

- `scan.mjs` previously honored explicit `api` fields only when the URL contained `greenhouse`; this caused valid explicit Lever endpoints like Netflix to be skipped.
- The safe fix pattern was to centralize provider detection/parsing in a helper module and add node tests before patching the main scanner.
- Workday support worked reliably only for explicitly validated `wday/cxs/.../jobs` endpoints. Inferring a Workday API endpoint from a `myworkdayjobs.com` careers URL was too fragile and was removed.

## Validation pattern

1. Add or update tests first for provider detection and parser output.
2. Prefer explicit `api` + `api_provider` fields in `portals.yml` for Workday.
3. Validate the endpoint directly before enabling it in zero-token scans.
4. Keep `scan_method: websearch` in place as a manual fallback even after API enablement when location-specific discovery is still useful.

## Verified examples from this session

These were good zero-token candidates after explicit endpoint validation:

- Workday
  - careers: `https://workday.wd5.myworkdayjobs.com/Workday`
  - api: `https://workday.wd5.myworkdayjobs.com/wday/cxs/workday/Workday/jobs`
- Nvidia
  - careers: `https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite`
  - api: `https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs`
- Autodesk
  - careers: `https://autodesk.wd1.myworkdayjobs.com/Ext`
  - api: `https://autodesk.wd1.myworkdayjobs.com/wday/cxs/autodesk/Ext/jobs`

These remained manual/websearch priorities because the endpoints were not confidently validated yet:

- Toyota
- Flex

## Verification commands

```bash
node --check scan.mjs
node --check scan-lib.mjs
node --test tests/scan-lib.test.mjs
node scan.mjs --dry-run
```

Useful coverage check:

```bash
node - <<'NODE'
import yaml from 'js-yaml';
import { readFileSync } from 'fs';
import { detectApi } from './scan-lib.mjs';
const data = yaml.load(readFileSync('portals.yml', 'utf8'));
const companies = (data.tracked_companies || []).filter(c => c.enabled !== false);
const supported = companies.filter(c => detectApi(c));
console.log(JSON.stringify({enabled: companies.length, supported: supported.length, unsupported: companies.length - supported.length}, null, 2));
NODE
```

## Pitfall

Do not promise generic Workday support from a careers URL alone. If the endpoint is not explicitly validated, leave the company on manual/websearch tracking instead of guessing the `wday/cxs` path.
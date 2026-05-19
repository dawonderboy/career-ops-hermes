Kill any process on port 3940 and restart the career-ops React dashboard.

```bash
lsof -ti:3940 | xargs kill -9 2>/dev/null; lsof -ti:3941 | xargs kill -9 2>/dev/null; node web-dashboard.react.mjs --port 3940 --cert .tls/combined.crt --key .tls/combined.key --cert2 .tls/tailscale.crt --key2 .tls/tailscale.key --public-host ${CAREER_OPS_PUBLIC_HOST:-localhost}
```

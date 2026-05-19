Kill any process on port 3737 and restart the career-ops web dashboard.

```bash
lsof -ti:3737 | xargs kill -9 2>/dev/null; node web-dashboard.mjs
```

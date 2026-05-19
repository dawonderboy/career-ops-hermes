# Dashboard Demo Dataset

This folder contains a safe, fictional dataset for testing the web dashboards without personal data.

Run either dashboard against this folder:

```bash
npm run dashboard:demo
# or
npm run dashboard:demo:classic
```

What is included:
- 3 fictional applications with different statuses and scores
- 3 matching reports in `reports/`
- 2 interview-prep notes in `interview-prep/`
- placeholder resume PDFs in `output/`
- `config/profile.yml` with calendar integration disabled so the dashboard works without Google setup

This dataset is intentionally static and human-readable so contributors can tweak it when testing UI changes.

# Documentation

All product documentation lives in **`apps/docs/src/pages/`** as **TSX** (React components). There is no HTML build sync — legacy HTML reports were converted to TSX under `commercial-viability/`.

```bash
pnpm docs:dev     # http://localhost:5173 — passcode: pilot-docs
pnpm docs:build   # → apps/docs/dist
```

## Commercial viability reports

Five full assessments (converted from legacy HTML):

| Route | Page |
|-------|------|
| `#/commercial-viability` | Hub + scorecard |
| `#/commercial-viability/report` | Primary assessment |
| `#/commercial-viability/assessment` | Assessment (reports/) |
| `#/commercial-viability/deep-assessment` | Deep assessment |
| `#/commercial-viability/deep-dive` | Deep dive |
| `#/commercial-viability/deep-dive-2026` | 2026 deep dive |

To re-generate TSX from HTML sources (if you restore HTML files): `pnpm docs:convert-html`

Deploy: GitHub Pages or Vercel — see `apps/docs/DEPLOY.md`.

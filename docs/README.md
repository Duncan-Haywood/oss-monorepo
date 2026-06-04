# Documentation

All product documentation lives in **`apps/docs/src/pages/`** as **TSX** (React components).

```bash
pnpm docs:dev     # http://localhost:5173 — passcode: pilot-docs
pnpm docs:build   # → apps/docs/dist
```

## Commercial viability reports

Five full assessments as native TSX JSX (converted from legacy HTML):

| Route | Page |
|-------|------|
| `#/commercial-viability` | Hub + scorecard |
| `#/commercial-viability/report` | Primary assessment |
| `#/commercial-viability/assessment` | Assessment variant |
| `#/commercial-viability/deep-assessment` | Deep assessment |
| `#/commercial-viability/deep-dive` | Deep dive |
| `#/commercial-viability/deep-dive-2026` | 2026 deep dive |

Legacy HTML source (for `pnpm docs:convert-html`): [`commercial-viability-report.html`](./commercial-viability-report.html). Additional sources under `reports/`.

To regenerate TSX from HTML sources: `pnpm docs:convert-html`

Deploy: GitHub Pages or Vercel — see `apps/docs/DEPLOY.md`.

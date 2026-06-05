# Documentation

All product documentation lives in **`apps/docs/src/pages/`** as **TSX** (React components). Agents and editors should follow **`.cursor/rules/documentation-tsx.mdc`** and **`AGENTS.md`**.

```bash
pnpm docs:dev     # http://localhost:5173 — passcode: pilot-docs
pnpm docs:build   # → apps/docs/dist
pnpm docs:export  # build + print dist path (one-off HTML)
```

## One-off HTML or PDF

| Goal | How |
|------|-----|
| **Share static HTML** | `pnpm docs:export` then ship or host `apps/docs/dist/` |
| **Quick PDF** | `pnpm docs:preview`, open the route (hash URL), **Print → Save as PDF** |

Do not maintain separate `.html` or `.pdf` source files — TSX is canonical; exports are derived.

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

## Deploy

CI builds `apps/docs/dist` on every push to `main`. Workflow `.github/workflows/deploy-docs.yml` publishes to **private GitHub Pages** when enabled (Settings → Pages → Source: GitHub Actions; visibility: Private). For external stakeholders, see `vercel.docs.json` and `apps/docs/DEPLOY.md`.

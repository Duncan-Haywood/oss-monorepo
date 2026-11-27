# Paid apps

The paid products, moved here from the private repository one app at a time
(task `products-to-public-repo` in `portfolio/work/tasks.yaml`; owner,
2026-11-26: they live in this public repository under an all-rights-reserved
licence, source visible). Each app and package carries that notice as its
`LICENSE` (template: `portfolio/monetization/licences/ALL-RIGHTS-RESERVED`).
The free catalogue in `ventures/` is MIT and is not part of this workspace.

| path | what | moved |
|---|---|---|
| `apps/payapps` | PayApps, bet #1: pay applications, retainage, lien waivers, change orders, job costing | 2026-11-27, from private `0c4bf8e8` |
| `apps/payapps-site` | its marketing site | same |
| `packages/billing`, `lien-waivers`, `qbo-sync`, `admin-metrics` | shared code PayApps consumes as source (path aliases) | same |

Layout: one pnpm workspace at the repository root (`pnpm-workspace.yaml`,
`apps/*`, `packages/*`), at the same paths as in the private repository, so
relative imports (`../../packages/...`, `../../scripts/...`) still resolve.

```
pnpm install --frozen-lockfile --filter "{./apps/payapps}..."
cd apps/payapps && pnpm typecheck && pnpm test:unit && pnpm test:worker && pnpm build
```

CI: `.github/workflows/payapps-ci.yml` and `payapps-site-ci.yml`, read-only
and secret-free. The deploy (Cloudflare credentials) is a separate `priv-`
workflow, its own reviewed change. Payments infrastructure, the secrets
inventory and owner checklists stay in the private repository.

Before each move: `python3 platform/security/prepub_audit.py <private clone> <paths>`
on the commit actually copied (PayApps: `docs/reports/2026-11-27-prepub-audit-payapps.md`,
re-run at `0c4bf8e8`: 0 block, 47 review, same decisions).

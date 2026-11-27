# PayApps (in development)

Pay-application billing for specialty subcontractors: schedule of values, change orders, retainage,
and an application-for-payment summary + continuation sheet as PDF and CSV. Not an AIA document.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first; plans in [ROADMAP.md](ROADMAP.md); paid plans
(dark until the owner sets the Paddle secrets) in [docs/BILLING.md](docs/BILLING.md); deploying in
[docs/DEPLOY.md](docs/DEPLOY.md).

```sh
pnpm install                  # from the repo root
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev                      # http://localhost:5173
pnpm typecheck && pnpm test:unit && pnpm test:worker && pnpm build
```

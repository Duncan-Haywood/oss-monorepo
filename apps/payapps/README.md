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

## Provenance

Moved on 2026-11-26 from `Duncan-Haywood/private-monorepo` `apps/payapps` at commit
`b1b7c3f63ce289c4051d8506eb0744856350f80e` (a copy of the tree, not its git history), when the paid apps moved
to this public repository. Licence: the root `LICENSE` (FSL-1.1-MIT) unless this
directory's own LICENSE says otherwise; third-party files keep their notices. Index:
[`apps/README.md`](../../apps/README.md).

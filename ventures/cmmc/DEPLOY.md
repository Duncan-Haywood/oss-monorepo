# Deploying CMMC Workspace from this repository

**Not yet.** The deploy workflow still lives in `private-monorepo`
(`.github/workflows/cmmc-deploy.yml`), whose Actions start no jobs, so the app has never deployed.
What the deploy does, step by step, is in [`apps/cmmc/docs/DEPLOY.md`](apps/cmmc/docs/DEPLOY.md)
(its link to the workflow points at the private repository's path until the port below lands). The
marketing site (`apps/cmmc-site`) has no deploy workflow anywhere yet; its README, "Deploy (owner)",
lists the wrangler steps.

## The port, in its own PR

A `priv-cmmc-deploy.yml` here, ported from the private workflow, runs by hand only
(`workflow_dispatch`) in a `cmmc-production` environment. It is a control-plane change (deploy
credentials), so it goes in its own PR through the full gates, after the PayApps port
(`ventures/payapps/DEPLOY.md`, open PR 19586) shows the pattern on this repository.

Settings it needs in this repository (names only; values are never in the tree), from
`apps/cmmc/docs/DEPLOY.md`, "Settings":

| Name | Kind |
| --- | --- |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secret (the account id may be a variable) |
| `CMMC_DOMAIN`, `CMMC_EMAIL_FROM`, `CMMC_BILLING_PROVIDER` | variables |
| `CMMC_ANTHROPIC_API_KEY` (or the shared `ANTHROPIC_API_KEY`), `CMMC_AUTH_SECRET` (optional) | secrets |
| `CMMC_BILLING_API_KEY`, `CMMC_BILLING_WEBHOOK_SECRET`, `CMMC_BILLING_PRICE_IDS` | secrets, paid plans only |

Payments: the Paddle webhook is served by the app's own Worker, so nothing payments-side has to stay
in `private-monorepo` except the secrets inventory and owner checklists (task
`products-to-public-repo`, point 5). The app deploys with a Cloudflare token, not the payments
account's OIDC trust, so that trust is not affected.

## Then

1. Deploy once by hand; `/api/health` answers ok.
2. Remove `private-monorepo/apps/cmmc` and `apps/cmmc-site` in a private PR, repoint
   `portfolio/monetization/bets.md` ("Where it is built") and the `private-monorepo/apps/cmmc` row
   key in `portfolio/monetization/models.yaml`.

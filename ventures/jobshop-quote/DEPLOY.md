# Deploying Job Shop Quote from this repository

**Not yet.** The deploy workflow still lives in `private-monorepo`
(`.github/workflows/jobshop-quote-deploy.yml`), whose Actions start no jobs, so the app has never
deployed. What the deploy does, step by step, is in
[`apps/jobshop-quote/docs/DEPLOY.md`](apps/jobshop-quote/docs/DEPLOY.md) (its link to the workflow
points at the private repository's path until the port below lands).

## The port, in its own PR

A `priv-jobshop-quote-deploy.yml` here, ported from the private workflow, runs by hand only
(`workflow_dispatch`) in a `jobshop-quote-production` environment. It is a control-plane change
(deploy credentials), so it goes in its own PR through the full gates, after the PayApps port
(`ventures/payapps/DEPLOY.md`) shows the pattern on this repository.

Settings it needs in this repository (names only; values are never in the tree), from
`apps/jobshop-quote/docs/DEPLOY.md`, "Settings":

| Name | Kind |
| --- | --- |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secret (the account id may be a variable) |
| `JOBSHOP_DOMAIN`, `JOBSHOP_EMAIL_FROM`, `JOBSHOP_BILLING_PROVIDER`, `JOBSHOP_INBOUND_EMAIL` | variables |
| `JOBSHOP_ANTHROPIC_API_KEY` (or the shared `ANTHROPIC_API_KEY`), `JOBSHOP_AUTH_SECRET` (optional) | secrets |
| `JOBSHOP_BILLING_API_KEY`, `JOBSHOP_BILLING_WEBHOOK_SECRET`, `JOBSHOP_BILLING_PRICE_IDS` | secrets, paid plans only |

Payments: the Paddle webhook is served by the app's own Worker, so nothing payments-side has to stay
in `private-monorepo` except the secrets inventory and owner checklists (task
`products-to-public-repo`, point 5). The payments account's OIDC trust is `private-monorepo` only;
this app deploys with a Cloudflare token, not that trust, so it is not affected.

## Then

1. Deploy once by hand; `/api/health` answers `ok: true, app: "jobshop-quote"`.
2. Remove `private-monorepo/apps/jobshop-quote` and `apps/jobshop-site` in a private PR, repoint
   `portfolio/monetization/bets.md` ("Where it is built") and the `private-monorepo/apps/jobshop-quote`
   row key in `portfolio/monetization/models.yaml`.

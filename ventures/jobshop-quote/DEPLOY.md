# Deploying Job Shop Quote from this repository

**Ported 2026-11-27, not run yet.** [`.github/workflows/priv-jobshop-quote-deploy.yml`](../../.github/workflows/priv-jobshop-quote-deploy.yml)
is the port of `private-monorepo`'s `jobshop-quote-deploy.yml` (which never ran: that repository's
Actions start no jobs). Manual only (`workflow_dispatch`), from `main` only, in the
`jobshop-quote-production` environment. What each step does is in
[`apps/jobshop-quote/docs/DEPLOY.md`](apps/jobshop-quote/docs/DEPLOY.md).

## The port

Done the way PayApps and Seller Books did it: an allowlist PR for the secrets the workflow reads
first (PR #19670; a change to a gate is judged by main's gate), then the workflow, a CODEOWNERS line
for `/ventures/jobshop-quote/` (the deploy job runs this venture's code with Cloudflare credentials,
so `ci_policy_check.py` wants an owner) and the regenerated `platform/ci/publish-surface.yaml`.

Differences from the private workflow:

- the PayApps hardening: actions pinned by SHA, checkout without persisted credentials and sparse
  to `ventures/jobshop-quote`, a job guard that refuses any ref but `main`, secrets used as stored;
- **no fallback to the shared `ANTHROPIC_API_KEY`**: AI extraction turns on only when the owner sets
  `JOBSHOP_ANTHROPIC_API_KEY`, so this product's LLM spend is always an explicit choice;
- the inbound-email step warns and succeeds instead of `continue-on-error` (the adversarial gate
  blocks that in a privileged job); on failure it writes no `inbound_domain`, so RFQs by email stay off;
- a Paddle sync failure warns and falls back to `JOBSHOP_BILLING_PRICE_IDS`, as PayApps does;
- the smoke test waits 300 s, for a custom domain's first certificate.

Settings it needs in this repository (names only; values are never in the tree), from
`apps/jobshop-quote/docs/DEPLOY.md`, "Settings":

| Name | Kind |
| --- | --- |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secret (the account id may be a variable) |
| `JOBSHOP_DOMAIN`, `JOBSHOP_EMAIL_FROM`, `JOBSHOP_BILLING_PROVIDER`, `JOBSHOP_INBOUND_EMAIL` | variables |
| `JOBSHOP_ANTHROPIC_API_KEY` (no shared fallback), `JOBSHOP_AUTH_SECRET` (optional), `CLOUDFLARE_EMAIL_ROUTING_TOKEN` (optional, inbound RFQs) | secrets |
| `JOBSHOP_BILLING_API_KEY`, `JOBSHOP_BILLING_WEBHOOK_SECRET`, `JOBSHOP_BILLING_PRICE_IDS` | secrets, paid plans only |

Payments: the Paddle webhook is served by the app's own Worker, so nothing payments-side has to stay
in `private-monorepo` except the secrets inventory and owner checklists (task
`products-to-public-repo`, point 5). The payments account's OIDC trust is `private-monorepo` only;
this app deploys with a Cloudflare token, not that trust, so it is not affected.

## Then

1. **Before the first run:** the launch review `docs/legal/OPERATOR.md` asks for, recorded in
   `apps/jobshop-quote/docs/LAUNCH-REVIEW.md` (every paid plan's margin at full allowance, including
   LLM and Workers AI cost per RFQ read; the Terms, Privacy, Refunds and Acceptable Use pages read
   against what the app does). Seller Books' `apps/seller-books/docs/LAUNCH-REVIEW.md` is the model.
2. **The Cloudflare token needs R2 edit.** PayApps' ROADMAP (2026-11-27) says its attachments are off
   because the token lacks Workers R2 Storage edit. Job Shop Quote cannot run without R2, so
   `provision.mjs` will stop the run before anything is deployed until the owner adds that permission
   (and Workers AI) to `CLOUDFLARE_API_TOKEN`.
3. Deploy once by hand; `/api/health` answers `ok: true, app: "jobshop-quote"`.
4. Remove `private-monorepo/apps/jobshop-quote` and `apps/jobshop-site` in a private PR, repoint
   `portfolio/monetization/bets.md` ("Where it is built") and the `private-monorepo/apps/jobshop-quote`
   row key in `portfolio/monetization/models.yaml`.

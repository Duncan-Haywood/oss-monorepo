# Runbook: secrets and settings for the paid apps

The paid apps moved from `Duncan-Haywood/private-monorepo` into this repository on
2026-11-26 (`apps/`, `packages/`; index in [`apps/README.md`](../../apps/README.md)).
This page lists every secret and setting their deploys need, where each one lives, and
which ones the owner must supply. Agents never see or copy secret values.

Three owner directions from 2026-11-26 shape it:

- **Secrets live in AWS Secrets Manager, not in GitHub** ("more on aws and less on gh ...
  secrets etc gets managed in aws not in gh"). GitHub holds only non-secret variables.
- **Off Cloudflare.** The apps were Cloudflare Workers (D1, R2, Queues, Email). Their
  Cloudflare deploy workflows were **not** ported. They will run on the AWS SaaS starter
  ([`platform/aws/stacks/saas-starter`](../../platform/aws/stacks/saas-starter/README.md)),
  which runs a Worker-shaped `fetch(request, env, ctx)` with D1- and R2-shaped shims.
- **No launch gates the owner has to lift by hand:** deploys run on every merge to `main`
  once their settings exist, checkout turns on when the Paddle secrets exist, and legal
  pages are no longer marked "draft until counsel".

## What deploys today: nothing yet, and why

| Blocker | Who | State on 2026-11-26 |
|---|---|---|
| An AWS account connected to this repository | owner (card, ID) | Not done: every `priv-aws-apply.yml` run is `skipped`, because `vars.AWS_ACCOUNT_ID` is empty. Steps: [`aws-cutover.md`](aws-cutover.md), "Owner checklist", 1-4. |
| Each app ported from Workers to the starter (D1 to Postgres through the D1 shim, R2 to S3, Queues and crons to SQS and EventBridge, Cloudflare Email to SES) | agents | Not started. One stack per app under `platform/aws/stacks/<app>/`, applied by the existing `priv-aws-apply.yml` on merge. That workflow already skips cleanly while the account is missing. |
| The three shared secret values below | owner | Cannot exist before the AWS account does. |

Deploy-on-merge comes from `priv-aws-apply.yml`, which applies every stack on each merge
to `main` and skips while `AWS_ACCOUNT_ID` is unset. A ported app needs no workflow of its
own. CI (lint, types, tests, build) runs now, on every PR, in the `apps-*-ci.yml`
workflows, which hold no secrets.

## What the owner supplies (the whole list)

### Secrets: AWS Secrets Manager, in the apps account

| Secret name | Value | Read by | Replaces (private-repo GitHub secrets) |
|---|---|---|---|
| `paid-apps/paddle-api-key` | A Paddle API key (Paddle > Developer tools > Authentication), live account | every app's deploy (catalog sync, webhook setup) and runtime (checkout, portal) | `BILLING_API_KEY`, `PAYAPPS_/JOBSHOP_/CMMC_/SELLER_BOOKS_BILLING_API_KEY` |
| `paid-apps/anthropic-api-key` | An Anthropic API key, **only until** Claude Platform on AWS is on ([`aws-cutover.md`](aws-cutover.md), step 5). After that, the Lambdas call the model with their own IAM role (SigV4) and this secret is deleted | jobshop-quote, cmmc, einvoice-preflight (pro) | `ANTHROPIC_API_KEY`, `JOBSHOP_/CMMC_ANTHROPIC_API_KEY` |
| `paid-apps/platform-admin-emails` | The owner's sign-in email(s), comma-separated: who may open each product's admin pages and the admin console. Kept here because it is personal data and this repository is public | every app's admin router, `apps/admin` | `PLATFORM_ADMIN_EMAILS` (`set-admins.yml` input) |
| `paid-apps/cloudflare-api-token` | **Not needed.** Listed in an earlier direction; the apps no longer deploy to Cloudflare. Create it only for the DNS move ([`platform/aws/stacks/dns`](../../platform/aws/stacks/dns/README.md)) if that stack still asks | (none) | `CLOUDFLARE_API_TOKEN`, `CF_API_TOKEN` and their variants |

Putting one in (once, from AWS CloudShell in the apps account; the value never enters
this repository or a chat):

```sh
aws secretsmanager create-secret --name paid-apps/paddle-api-key --secret-string '<value>'
```

### Variables: GitHub repository variables, not secret

| Variable | Example | Used for |
|---|---|---|
| `AWS_ACCOUNT_ID` | `123456789012` | already read by `priv-aws-apply.yml`; turns every AWS apply on |
| `AWS_REGION` | `us-east-1` | already read (defaults to `us-east-1`) |
| `LEGAL_ENTITY_NAME` | `Maris Stella Labs LLC` | the operator name on legal pages and receipts. Today the name is written into each app's `docs/legal/*.md`; the app stacks will pass this variable through once they exist. Until then it is optional |

Not needed: `CLOUDFLARE_ACCOUNT_ID` (no Cloudflare deploys), and the admin console's
`ADMIN_CONSOLE_CF_ACCESS_*` (Cognito replaces Cloudflare Access). `ADMIN_CONSOLE_PRODUCTS`,
`ADMIN_CONSOLE_DIGEST` and `ADMIN_CONSOLE_EMAIL_FROM` move into the admin stack as code.

**Check first: there may already be an AWS account.** The private repository's
`set-admins.yml` assumes `vars.PAID_APPS_AWS_ROLE_ARN` and writes
`paid-apps/admin-*-token` to Secrets Manager. If that role exists, the account behind it is
the one to connect here (`AWS_ACCOUNT_ID`), and the `paid-apps/*` secrets may already be
in it. An agent cannot read that variable's value; the owner can see it under the private
repository's Settings > Secrets and variables > Actions > Variables.

## What deploys generate themselves

Each app's stack will write these under `paid-apps/<app>/` on its first apply, and later
applies will leave them alone. The owner never sees them. None of the stacks exist yet;
this is the contract they are written to.

| Secret | How it is made | Replaces |
|---|---|---|
| `paid-apps/<app>/auth-secret` | `random_password` (64 chars) in the stack, stored in Secrets Manager. Created once; rotating it signs everyone out | `AUTH_SECRET`, `<APP>_AUTH_SECRET` |
| `paid-apps/<app>/paddle-webhook-secret` | The deploy creates the app's notification destination through Paddle's API (`POST /notification-settings`, URL = the app's `/api/billing/webhook`, events `subscription.*`, `transaction.completed`) with `paid-apps/paddle-api-key`, and stores the `endpoint_secret_key` it returns. To be written: the starter's step 3 is still a dashboard click | `BILLING_WEBHOOK_SECRET`, `<APP>_BILLING_WEBHOOK_SECRET` |
| price ids | Catalog sync (`packages/billing/src/paddle-catalog.ts`, already in the tree) creates or updates the Paddle products and prices from the app's plan table. The app stack will run it at deploy time and pass the ids in, so there is nothing to copy (to be wired in each app's stack) | `BILLING_PRICE_IDS`, `<APP>_BILLING_PRICE_IDS` |
| `paid-apps/<app>/checkout-secret` (einvoice-preflight) | `random_password` (32+ chars) | `CHECKOUT_SECRET` |
| `paid-apps/jobshop-quote/inbound-token-key` | `random_password` | (Cloudflare Email Routing secrets) |
| `paid-apps/admin-service-token`, `paid-apps/admin-metrics-token` | Already generated this way by the private repository's `set-admins.yml` (rotate / `sync_metrics_token`); the admin stack keeps doing it | `ADMIN_SERVICE_TOKEN`, `ADMIN_METRICS_TOKEN` |

`BILLING_PROVIDER` is no longer a setting. It defaults to `paddle` when the API key and
webhook secret both exist, and to `none` otherwise (`packages/billing/src/factory.ts`,
`billingProviderName`). An explicit `BILLING_PROVIDER=none` still works as a kill switch.

## What is gone, and what it was

| Old name (private repo) | Why it is not needed |
|---|---|
| `CLOUDFLARE_*`, `CF_*`, `MARISSTELLA_ZONE_ID`, `CF_ACCESS_*`, `CF_WEB_ANALYTICS_TOKEN`, `TURNSTILE_*` | Cloudflare hosting, Access, Analytics and Turnstile retired. Sign-in is Cognito; bot checks move to Cognito's protections or AWS WAF |
| `CLOUDFLARE_EMAIL_ROUTING_TOKEN`, `CLOUDFLARE_EMAIL_SENDING_TOKEN`, `RESEND_API_KEY` | Email moves to SES (IAM role, no key; [`aws-cutover.md`](aws-cutover.md)) |
| `<APP>_DOMAIN`, `<APP>_EMAIL_FROM`, `APP_URL` | Set in each app's stack (code, not settings) |
| `<APP>_BILLING_PROVIDER` | Derived (above) |

## Optional, off until someone asks

| Feature | Needs | State |
|---|---|---|
| PayApps QuickBooks Online sync (`packages/qbo-sync`) | `paid-apps/payapps/qbo-client-id`, `qbo-client-secret` (an Intuit developer app) and a generated `qbo-token-key` | Off. Without them the QuickBooks screens stay hidden |

## Not moved: grants

`apps/grants` (Grant Autopilot) and its secrets (`GOOGLE_CLIENT_*`, `SLACK_SIGNING_SECRET`,
`SIMPLER_GRANTS_API_KEY`, `INTEGRATIONS_KEY`, `INTERNAL_API_TOKEN`, `PLATFORM_ADMIN_EMAILS`)
stayed in the private repository: it holds client-confidential material. See [`apps/README.md`](../../apps/README.md), "What stayed private".

# dunning-engine

After using this, you can now **win back failed Stripe subscription payments
with a plan per decline reason, on your own server and with your own
emails**, which used to mean paying a recovery service a cut of what it
recovers, or living with Stripe's one-size-fits-all retries.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/dunning-engine/

Two parts, both free and MIT:

- **`index.html`** — pick a Stripe `decline_code`, see the exact schedule of
  emails and retries Dunning Engine would run, preview the email, and estimate
  what recovery is worth with your own numbers. Runs in the browser; nothing is
  uploaded.
- **`server.mjs`** — the recovery service. One Node process, **zero
  dependencies**, state in one JSON file. It receives Stripe webhooks, plans and
  runs recovery, and reports at `/v1/summary` and a read-only dashboard at `/admin` (enter your `ADMIN_KEY`; open cases, next steps, recovered counts).

## Why someone would use this

| Today | Cost / catch | Dunning Engine |
|---|---|---|
| Stripe Smart Retries + Stripe's failed-payment emails | Free, good, but one policy for everyone and little say over wording | Your schedule, your wording, class-specific plans |
| Churn Buster, Churnkey, Baremetrics Recover and similar | Paid, often a share of recovered revenue; your customer data goes to a third party | Runs in your account, no per-recovery fee, nobody else sees your customers |
| A script you write yourself | Easy to get wrong: duplicate charges, retrying lost cards, double emails | Idempotent, tested state machine; dry-run by default |

**It can measure whether it works.** Set `HOLDOUT_PCT=10` and a stable 10% of
customers (by hash of the customer id) are left alone: their failures are
recorded, but they get no emails, retries or cancellation. `/v1/summary` and
`/admin` then compare how often treated and held-out invoices end up paid, with
a 95% interval on the difference, and say when the gap is still within chance
and roughly how many invoices it would take to tell. Here the measurement is your own data on your own server, not a vendor's claim. The cost is real: held-out customers are not chased, so keep
the share small and the experiment short. If Smart Retries is still on in Stripe
it applies to both groups, so the comparison is "us on top of Stripe" against
"Stripe alone".

Honest limits: the dashboard at `/admin` only lets you stop chasing an invoice (button, or `POST /v1/cases/<invoice>/stop` with your admin key; the case is kept as "stopped" and a repeat failure does not restart it), there is no in-app cancellation flow (see the sibling
`cancel-flow` venture) and no card-account-updater network access (the expiry
notice asks the customer instead). It does not claim a recovery uplift over
Stripe's own retries; measure that on your own data (`/v1/summary` reports what
it recovered). If Smart Retries already works for you, keep it.

Reference pages: [which Stripe decline codes to retry and which never to](https://duncan-haywood.github.io/monorepo-projects/dunning-engine/stripe-decline-codes.html) and [Dunning Engine vs paid recovery services](https://duncan-haywood.github.io/monorepo-projects/dunning-engine/vs-paid-recovery-services.html).

## What it does

1. **Classifies each decline** (`dunning.mjs`):
   `hard` (lost/stolen/restricted card) and `update` (expired, wrong number)
   are **never retried**; the customer is asked for a different card.
   `funds` (insufficient funds) retries on a spread schedule that optionally
   nudges toward payday (1st, 2nd, 15th, 16th, Fridays; a heuristic, off with
   `paydayAware:false`). `soft` (generic/temporary) retries 1, 3, 6, 10 days
   out. `auth` (SCA) goes to the customer only.
2. **Emails with a link that never expires.** Customer-portal URLs are
   short-lived, so emails link to `/update/<signed token>` on your server, which
   mints a fresh Stripe billing-portal session on click. Wording is neutral:
   it never says "stolen" or "fraud".
3. **Re-plans when it learns more.** If a retry comes back `lost_card`, pending
   retries are dropped. If the customer adds a card (`payment_method.attached`)
   an immediate retry is queued. If the invoice is paid, voided, marked
   uncollectible, or the subscription is cancelled, the case closes and nothing
   more is sent.
4. **Does not double-charge.** Before every retry it re-reads the invoice and
   skips it unless it is still `open`; retries carry an idempotency key; webhook
   event ids are de-duplicated.
5. **Warns before the card fails.** Once a day it lists active subscriptions
   and emails each customer whose card expires within 30 days (or already has)
   once per card, with the same never-expiring update link, so many failures
   never happen. Customers already being recovered, and subscriptions set to
   cancel at period end, are skipped. Turn off with `EXPIRY_NOTICES=false`;
   change the window with `EXPIRY_DAYS`. Needs Subscriptions read on the key.
6. **At the end of the grace period** it alerts you (`ALERT_WEBHOOK_URL`) and
   leaves the subscription alone, unless you set `CANCEL_ON_EXPIRE=true`.

## Run it

```sh
cd ventures/dunning-engine
node --test        # 85 tests, no network
STRIPE_SECRET_KEY=rk_test_... STRIPE_WEBHOOK_SECRET=whsec_... \
ADMIN_KEY=$(openssl rand -hex 16) LINK_SECRET=$(openssl rand -hex 16) \
PUBLIC_URL=https://dunning.example.com node server.mjs
```

It starts in **DRY_RUN** (the default): failures are recorded and every email or
retry it *would* do is logged, but Stripe and your customers are not touched.
Try it with a **test-mode** key and `stripe trigger invoice.payment_failed`,
read the log, then set `DRY_RUN=false` with `RESEND_API_KEY` and `MAIL_FROM`.

Before going live, run the preflight with the same environment:
`node doctor.mjs` (in Docker: `docker exec <container> node doctor.mjs`). It checks the
config, that the key can read invoices, customers, subscriptions and
PaymentIntents, that an active customer-portal configuration exists, that a
webhook endpoint points at `PUBLIC_URL/webhook/stripe` and has all seven events,
and that `/healthz` answers. It only reads from Stripe, so it cannot test write
permissions, and Smart Retries cannot be read through the API, so it always
reminds you to turn it off. Exit code 1 means a blocker.

Setup in Stripe:

1. Create a restricted key: Invoices write, Customer portal write,
   PaymentIntents read, Customers read, Subscriptions read (expiry notices; write only if you enable
   `CANCEL_ON_EXPIRE`).
2. Add a webhook endpoint `https://<host>/webhook/stripe` for
   `invoice.payment_failed`, `invoice.paid`, `invoice.payment_succeeded`,
   `invoice.voided`, `invoice.marked_uncollectible`,
   `customer.subscription.deleted`, `payment_method.attached`.
3. Settings, Billing, Subscriptions and emails: **turn off Smart Retries / the
   automatic retry schedule** (and, if you want only these emails, Stripe's
   failed-payment emails), so exactly one system charges and writes to your
   customers. Enable the customer portal under Settings, Billing, Customer
   portal.

| Env | Purpose |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | required |
| `ADMIN_KEY` | bearer token for `GET /v1/summary` and `/v1/cases` |
| `LINK_SECRET` | signs the `/update/` links |
| `PUBLIC_URL` | where this server is reachable (used in emails) |
| `RESEND_API_KEY`, `MAIL_FROM` | email sending (needed when `DRY_RUN=false`) |
| `COMPANY_NAME`, `COMPANY_ADDRESS` | email wording and footer |
| `POLICY_JSON` | override the schedule, e.g. `{"graceDays":10,"softRetryDays":[2,5]}` |
| `EXPIRY_NOTICES`, `EXPIRY_DAYS` | card-expiry heads-up emails (default on, 30 days) |
| `DIGEST_TO` | email address that gets a plain-text weekly summary (new failures, recovered, lost, still open); off when unset |
| `HOLDOUT_PCT` | share of customers left alone to measure uplift, 0 to 50 (default 0 = off) |
| `ALERT_WEBHOOK_URL` | Slack/Discord-style `{"text":...}` alerts |
| `STATE` | path of the JSON state file |

## One-click deploy (your own account)

Fork this repository and open `https://render.com/deploy?repo=<your fork URL>`.
`render.yaml` builds the `Dockerfile` here in **your** Render account with a
1 GB disk for the state file, and generates `ADMIN_KEY` and `LINK_SECRET`.
Nothing runs on the author's side. Fill in the Stripe and email variables in
Render's environment tab. State must survive restarts (open cases and
pending steps live in it), which is why this uses a paid instance with a disk
rather than the free tier. Docker anywhere works too:
`docker build -t dunning-engine . && docker run -p 8080:8080 -v dd:/data -e STATE=/data/state.json ... dunning-engine`.

## Status and what is not verified

Everything in `node --test` passes against a fake Stripe. It has **not** been
run against live Stripe by the author: do that in test mode before going live.
Email and consumer-protection rules for payment-failure notices differ by
country; you are the operator and responsible for them.

Files: `dunning.mjs` (classification, schedule; also runs in the browser),
`templates.mjs` (emails), `engine.mjs` (state machine), `holdout.mjs` (uplift experiment), `stripe.mjs` (webhook
verification, API calls), `server.mjs` (HTTP shell), `admin.mjs` (dashboard page), `doctor.mjs` (go-live preflight), `index.html` (simulator).

Support the project: <https://github.com/sponsors/Duncan-Haywood>.

## Other self-deploy paths

`docker-compose.yml` runs it on any box with Docker (the command is at its top). Fly.io: the steps are at the top of `fly.toml`. Both keep state on a volume and run in your own account.

# trial-converter

After using this, you can now **turn more Stripe free trials into paying
customers, on your own server and with your own emails**: trials with a card
get an honest price-and-date heads-up, trials without one get a scheduled
"add a card" sequence and, if you choose, one extension. That used to mean
paying a lifecycle-email tool that bills by contact count, or hand-writing
webhook glue.

Two parts, both free and MIT:

- **`index.html`** — pick card or no card, trial length and start, see the exact
  schedule of emails Trial Converter would send, preview each one, and estimate
  what a better conversion rate is worth with your own numbers. Runs in the
  browser; nothing is uploaded.
- **`server.mjs`** — the service. One Node process, **zero dependencies**, state
  in one JSON file. It receives Stripe webhooks, plans and sends the emails, and
  reports at `/v1/summary` and a read-only dashboard at `/admin` (enter your
  `ADMIN_KEY`).

## Why someone would use this

| Today | Cost / catch | Trial Converter |
|---|---|---|
| Stripe `trial_will_end` webhook and reminder email | Free, three days before the end, only for trials with a card; nothing for card-less trials | A schedule per trial type, including card-less |
| Lifecycle tools (Customer.io, Userlist, Baremetrics, ProfitWell) | Paid, priced by contacts or MRR; your customer data goes to a third party | Runs in your account, no per-contact fee, nobody else sees your customers |
| Your own webhook script | Easy to get wrong: email after the trial ended, duplicates, no extension guard | Idempotent, tested state machine; stale steps are skipped; dry-run by default |

Honest limits: it does **not** collect the card itself (the email links to the
Stripe billing portal, so enable it with payment-method updates), it does not
send onboarding or product-usage emails beyond one optional midway note, and
it does not claim an uplift. Measure that on your own data: `/v1/summary`
reports conversion with and without a card. If Stripe's own reminder already
works for you, keep it.

## What it does

1. **Two plans** (`trial.mjs`). *Card on file:* one email 3 days before the end
   stating the price, the date and a link to manage or cancel; trials of 6+
   days also get one midway note (set `TIPS_URL` to link a starting point).
   *No card:* emails 5 days, 2 days and 6 hours before the end, each asking for
   a card, plus an optional extension. A trial too short for a reminder still
   gets one at its midpoint; nothing is scheduled before the trial starts.
2. **Never emails late.** A step more than 24 hours overdue (server down, state
   restored) is skipped, so "ends in 3 days" is never sent after the trial ended.
3. **Re-plans when it learns more.** A card added mid-trial
   (`payment_method.attached`) swaps the begging for the heads-up; a trial moved
   by you re-plans from its new end; conversion (`active`, first paid invoice),
   cancellation or pause closes the case and nothing more is sent.
4. **One optional extension.** With `EXTEND_DAYS=3`, a card-less trial that still
   has no card two hours before the end is extended once, after re-reading the
   subscription from Stripe, with an idempotency key, followed by a notice. Off by
   default. Needs Subscriptions write on the key.
5. **Never charges anyone.** Stripe converts the trial; this only emails and, if
   enabled, moves the end date.
6. **Reports honestly.** `/v1/summary` shows open trials, conversion with a card
   and without one, emails sent and extensions used.

## Run it

```sh
cd ventures/trial-converter
node --test        # 30 tests, no network
STRIPE_SECRET_KEY=rk_test_... STRIPE_WEBHOOK_SECRET=whsec_... \
ADMIN_KEY=$(openssl rand -hex 16) LINK_SECRET=$(openssl rand -hex 16) \
PUBLIC_URL=https://trials.example.com node server.mjs
```

It starts in **DRY_RUN** (the default): trials are recorded and every email or
extension it *would* do is logged, but Stripe and your customers are not
touched. Try it with a **test-mode** key and a test trial, read the log, then
set `DRY_RUN=false` with `RESEND_API_KEY`, `MAIL_FROM` and `PUBLIC_URL`.

Setup in Stripe:

1. Create a restricted key: Customers read, Subscriptions read (write only if you
   set `EXTEND_DAYS`), Customer portal write.
2. Add a webhook endpoint `https://<host>/webhook/stripe` for
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `customer.subscription.paused`,
   `invoice.paid`, `payment_method.attached`.
3. Enable the customer portal (Settings, Billing, Customer portal) with
   payment-method updates on. If you use Stripe's own trial reminder email, turn
   it off, so customers get one message, not two.
4. For card-less trials set the end behaviour (`trial_settings.end_behavior.
   missing_payment_method`) to `cancel` or `pause`.

| Env | Purpose |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | required |
| `ADMIN_KEY` | bearer token for `GET /v1/summary` and `/v1/cases` |
| `LINK_SECRET` | signs the `/manage/` links |
| `PUBLIC_URL` | where this server is reachable (used in emails; required when live) |
| `RESEND_API_KEY`, `MAIL_FROM` | email sending (needed when `DRY_RUN=false`) |
| `COMPANY_NAME`, `COMPANY_ADDRESS`, `TIPS_URL` | email wording and footer |
| `EXTEND_DAYS` | one-time extension for card-less trials (default 0 = off) |
| `POLICY_JSON` | override the schedule, e.g. `{"nocardReminderDays":[4,1],"staleHours":12}` |
| `ALERT_WEBHOOK_URL` | Slack/Discord-style `{"text":...}` alerts when a step fails 3 times |
| `STATE` | path of the JSON state file |

## One-click deploy (your own account)

Fork this repository and open `https://render.com/deploy?repo=<your fork URL>`.
`render.yaml` builds the `Dockerfile` here in **your** Render account with a
1 GB disk for the state file, and generates `ADMIN_KEY` and `LINK_SECRET`.
Nothing runs on the author's side. State must survive restarts (open trials and
pending steps live in it), which is why this uses a paid instance with a disk
rather than the free tier. Docker anywhere works too:
`docker build -t trial-converter . && docker run -p 8080:8080 -v tc:/data -e STATE=/data/state.json ... trial-converter`.

## Status and what is not verified

Everything in `node --test` passes against a fake Stripe. It has **not** been
run against live Stripe by the author: do that in test mode before going live.
Email and consumer-protection rules for trial-to-paid notices differ by
country; you are the operator and responsible for them.

Files: `trial.mjs` (planning; also runs in the browser), `templates.mjs`
(emails), `engine.mjs` (state machine), `stripe.mjs` (webhook verification, API
calls), `server.mjs` (HTTP shell), `admin.mjs` (dashboard page), `index.html`
(simulator). Siblings on the same Stripe account: `dunning-engine`,
`cancel-flow`, `mrr-pulse`.

Support the project: <https://github.com/sponsors/Duncan-Haywood>.

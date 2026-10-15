# MRR Pulse

After using this, you can now **see your MRR, churn and net revenue retention
from a read-only Stripe key, on a server you run**, instead of paying a metrics
service a monthly fee that grows with your revenue and sharing your customer
list with it.

Two parts, both free and MIT:

- **`index.html`**: paste a Stripe subscription export (or load sample data)
  and get MRR, ARR, 12 months of history, logo churn, net revenue retention
  and quick ratio. Runs in the browser; nothing is uploaded.
- **`server.mjs`**: one Node process, **zero dependencies**, state in one JSON
  file. It lists your subscriptions from Stripe every few hours, keeps the
  monthly history and serves a password-protected dashboard plus a JSON API.

## Why someone would use this

| Today | Cost / catch | MRR Pulse |
|---|---|---|
| Stripe Dashboard Billing overview | Free, thin: no churn or retention history by month | Month-by-month new, expansion, contraction, churn, NRR |
| Baremetrics, ChartMogul, ProfitWell Metrics | Hosted; priced by revenue; your customer data lives with them | Your server, a read-only key, no fee |
| A spreadsheet fed by exports | Free, rebuilt by hand monthly; interval and quantity maths go wrong | Normalised the same way every sync |

Honest limits: no forecasting, multi-currency roll-up, or
non-Stripe billing. It does not tell you what your churn *should* be.

## What it counts

- **MRR**: active and past-due subscriptions; every price normalised to a
  month (yearly / 12, weekly × 4.35, interval counts and seat quantities
  applied); percent-off coupons netted.
- **Not counted**: trials, paused subscriptions, metered usage, fixed-amount
  coupons. (`COUNT_PAST_DUE=false` also drops past-due.)
- **Movements**: new, expansion, contraction, churned and reactivated MRR,
  from the difference between consecutive syncs. A customer who was seen
  before and returns is *reactivation*, not *new*.
- **Rates** use the last complete month: logo churn, revenue churn, NRR, GRR,
  quick ratio ((new + expansion + reactivation) ÷ (churn + contraction)).
- **First sync is approximate.** Stripe has no price history, so the previous
  12 months are rebuilt from start and end dates at today's prices (marked `~`).
  Expansion and contraction appear from the first sync onward, which means the
  server must keep running with its state file kept to build them.
- **Retention by signup month** (dashboard and `/v1/cohorts`): of each month's
  new subscriptions, the share still active at the end of month 0, 1, 2 ...
  Logo retention is exact from start and end dates; the revenue share uses
  today's prices. Trials and paused subscriptions are left out, and a
  customer with two subscriptions counts twice.
- **MRR by plan and customer concentration** (dashboard and `/v1/plans`):
  MRR, subscriptions and share per plan (price nickname, else product id;
  seat add-ons are their own line), plus the share held by the largest and
  top five customers. Plan totals equal the headline MRR. Customer ids are
  never shown.
- One currency per instance (`CURRENCY`, default: your most common); other
  subscriptions are left out and the dashboard says how many.

## Run it

```sh
cd ventures/mrr-pulse
node --test        # no network
STRIPE_SECRET_KEY=rk_live_... ADMIN_KEY=$(openssl rand -hex 16) \
COMPANY_NAME=Acme node server.mjs
```

Open `http://localhost:8080` and sign in with any user name and `ADMIN_KEY` as
the password. API (same key as `Authorization: Bearer ...`): `GET /v1/metrics`,
`GET /v1/months`, `GET /v1/cohorts`, `GET /v1/plans`, `POST /v1/sync`.

Stripe key: Dashboard, Developers, API keys, **Create restricted key**, set
*Subscriptions* to **Read** and everything else to None. The server only ever
issues GET requests, and the tests assert it.

Alerts (off by default): set `ALERT_WEBHOOK_URL` to a Slack or Discord
incoming-webhook URL (https only) and the server posts a digest (MRR, growth,
churn, NRR, quick ratio) every `DIGEST_DAYS` (default 7, `0` turns it off) and
an alert when this month's churned MRR passes `CHURN_ALERT_PCT` (default 5) of
the month's starting MRR. The webhook is yours; the message holds totals only,
no customer names or emails.

Settings: `SYNC_MINUTES` (default 360), `HISTORY_MONTHS` (12), `CURRENCY`,
`COUNT_PAST_DUE`, `MAX_PAGES` (500 pages of 100), `STATE` (path of the JSON
file; put it on a persistent disk), `PORT`.

## One-click deploy

Fork the repository, then open
`https://render.com/deploy?repo=<your fork URL>`. Render builds the Dockerfile
in **your** account with a 1 GB disk, generates `ADMIN_KEY`, and asks for your
restricted Stripe key. Nothing runs on the author's accounts. The same
Dockerfile runs on Fly.io, Railway or any VPS.

Serve it over HTTPS only (Render does); the dashboard uses HTTP Basic auth.

## Disclaimer

No warranty; no uptime guarantee. Figures are computed from the data the API
returns and are not accounting, tax or financial advice: reconcile against your
books before using them with investors. MIT licensed. If it saves you a
subscription, you can [sponsor the author](https://github.com/sponsors/Duncan-Haywood).

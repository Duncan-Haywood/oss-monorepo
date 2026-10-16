# Churn Radar

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/churn-radar/>

Churn prediction for small SaaS teams. Your app sends product-usage events;
Churn Radar learns from your own past cancellations which usage patterns come
before one, scores every active account, and says which look like the accounts
you lost and why. MIT, one Node process, no dependencies, state in a JSON file.

Try it on an export first: open `index.html` (nothing is uploaded; the page
makes no network requests).

## Why use this instead of what you have today

| Today | Problem for a small team | Churn Radar |
|---|---|---|
| ChurnZero, Gainsight, Vitally, Totango | Customer-success platforms: dashboards, playbooks, CRM sync, and a price that starts in the hundreds of dollars a month | One narrow job, free, no per-account fee, your data stays on your server |
| Baremetrics / ProfitWell churn reports | Tell you who already left, from billing data, not who is drifting | Scores active accounts from product usage, before the cancel click |
| A spreadsheet and a hunch | Works at ten customers, not at two hundred | Same idea applied to every account every week, with the reason attached |
| A data-science project | Weeks of work, nobody maintains it | Fitted and validated by the server itself, every six hours |

If you have a customer-success team and a CRM, buy a platform. This is for the
founder who wants a ranked "talk to these five people today" list.

## How it works

1. **Features** (per account, as of a date, using only events before it):
   activity in the last 7 days, week-over-week change, days since the last
   event, active days in the last 14, distinct features used in 28 days, and
   account age.
2. **Training rows.** Every account contributes one row per week of its life,
   labelled 1 if it cancelled within 30 days after that week. A week whose
   30-day outcome cannot be observed yet is left out, not labelled "stayed".
3. **Model.** Logistic regression on standardised features (L2-regularised,
   full-batch gradient descent), so every weight can be read.
4. **Honest validation.** It is fitted on weeks whose whole outcome window ended
   before a cutoff, then scored on the weeks after it. `/v1/model` and the page
   show the out-of-time AUC and the share of churners found in the top-scored
   10%. With too few churned or retained weeks to validate, it says so and
   calls the scores a ranking, not a forecast.
5. **Fallback.** Under 20 churned or 20 retained account-weeks it does not train
   and shows a fixed rule-based index (silence and falling activity), flagged
   `calibrated: false`.
6. **Reasons.** Each flagged account lists up to three features pushing its
   score up, in words ("last seen 12 days ago").

The tests use a seeded synthetic dataset, where churn is made to follow fading
activity, to prove the machinery finds a real signal when there is one
(out-of-time AUC above 0.65, top-decile capture above 25%). That says nothing
about your product: your accuracy is whatever `/v1/model` reports on your data.

## Run it

```
API_KEY=$(openssl rand -hex 16) ADMIN_KEY=$(openssl rand -hex 16) node server.mjs
```

| Variable | What |
|---|---|
| `API_KEY`, `ADMIN_KEY` | required, 16+ characters; the first is for your app, the second forces a retrain |
| `STATE` | state file, default `/tmp/state.json`; put it on a disk |
| `STRIPE_WEBHOOK_SECRET` | optional; verifies the Stripe webhook that records cancellations |
| `ALERT_WEBHOOK_URL`, `ALERT_WEBHOOK_SECRET` | optional; a signed `account.at_risk` POST, once per account per 14 days |

API (bearer `API_KEY`):

- `POST /v1/events` — `{id, account, type, timestamp?, signup?}` or `{events:[...]}` up to 500. Idempotent on `id`.
- `POST /v1/outcomes` — `{account, churnedAt?}` records a cancellation; `{account, churned:false}` undoes it.
- `GET /v1/at-risk?limit=20` — accounts at or above the threshold, with reasons.
- `GET /v1/digest?limit=10[&format=text]` — a paste-ready "talk to these people" list for Slack or email, with the reasons.
- `GET /v1/accounts/:id` — one account's score.
- `GET /v1/model` — mode, sample sizes, out-of-time validation, weights.
- `POST /stripe/webhook` — `customer.subscription.deleted` records a cancellation,
  `customer.subscription.created` clears one. The account is the subscription's
  `metadata.account_id`, else its Stripe customer id.
- `POST /v1/admin/retrain` — bearer `ADMIN_KEY`.

**Day-one history.** Export `account,date[,type]` rows from your analytics
tool (and `account,date` cancellations from billing) and load them, so the
first model trains on your past instead of waiting weeks:

```
RADAR_URL=https://radar.example.com RADAR_API_KEY=... node import.mjs events.csv cancellations.csv
```

It is safe to re-run (repeat rows are reported as duplicates). The browser page
takes the same two formats, so you can see the accuracy before you deploy.

`sdk.mjs` is a tiny fetch-based client: `radar.track("acct_42", "export_report")`.

Alert signature: `x-radar-signature: sha256=HMAC(ALERT_WEBHOOK_SECRET, body)`.
Point the alert at something that acts: a Slack message, an email to you, a
sequence in [Drip Keeper](../drip-keeper/), an offer from [Cancel Flow](../cancel-flow/).

## One-click deploy

Fork this repository, then open `https://render.com/deploy?repo=<your fork URL>`
(the blueprint is `render.yaml`; Render bills you, nothing runs on the author's
account). Or use the repository-wide deploy page. Docker:
`API_KEY=$(openssl rand -hex 16) ADMIN_KEY=$(openssl rand -hex 16) docker compose up -d`.
Fly.io: the steps are at the top of `fly.toml`.

## Limits

- The signal is product usage. An account quiet for a good reason (a quarterly
  workflow, a holiday) looks like one that is leaving.
- Needs history: roughly 20 cancellations' worth of weeks to train, more to
  validate. Younger products get the rule-based index.
- Each account keeps its newest 5,000 events; one JSON file rewritten on every
  write is fine for tens of thousands of events a day, not millions.
- Scores say who to contact, not why they are leaving or what to offer.
- It never contacts anyone. Send ids you choose, not names or emails.

## Tests

`node --test`

## Disclaimer

Free and MIT, provided as-is with no warranty and no uptime guarantee. Scores
are statistical estimates and can be wrong. You run it, so you are responsible
for how you contact customers, for backups and for your customers' privacy. Not
legal, tax or financial advice. If it helps,
[sponsor the author](https://github.com/sponsors/Duncan-Haywood).

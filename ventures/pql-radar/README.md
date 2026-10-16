# PQL Radar

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/pql-radar/>

Product-qualified-lead scoring for small SaaS teams with a free plan or trial.
Your app sends product-usage events; PQL Radar learns from your own past signups
which first-week behaviour came before paying, scores every signup that has
finished its first week, and says which look like your best customers and why.
MIT, one Node process, no dependencies, state in a JSON file.

Try it on an export first: open `index.html` (nothing is uploaded; the page
makes no network requests).

## Why use this instead of what you have today

| Today | Problem for a small team | PQL Radar |
|---|---|---|
| MadKudu, Pocus, Endgame, HubSpot or Salesforce lead scoring | Revenue platforms: CRM sync, enrichment, playbooks, and a price that starts in the hundreds of dollars a month | One narrow job, free, no per-seat fee, your data stays on your server |
| A hand-written rule ("invited a teammate = PQL") | Works until the product changes; nobody checks it against who actually paid | Fitted to who paid, with the accuracy shown on signups it did not train on |
| Sorting signups by company size | Says who could pay, not who is trying the product | Scores behaviour in the product, the part you already own |
| A data-science project | Weeks of work, nobody maintains it | Fitted and validated by the server itself, every six hours |

If you sell to enterprises through a sales team and a CRM, buy a platform. This
is for the founder who wants a ranked "email these five signups today" list.

## How it works

1. **Features** (per signup, from the first 7 days only): events, active days,
   distinct features used, the busiest day, hours to first use, and whether it
   was still active on days 6 and 7.
2. **Labels.** 1 if the account paid within 30 days of signing up. Left out on
   purpose: signups that paid inside week 1 (their usage is partly a result of
   paying, which would leak the answer), signups whose 30 days are not over yet
   (not labelled "didn't pay"), and signups that paid after day 30 (neither a
   clean yes nor a clean no). `/v1/model` reports how many were skipped.
3. **Model.** Logistic regression on standardised features (L2-regularised,
   full-batch gradient descent), so every weight can be read.
4. **Honest validation.** Fitted on signups whose whole 30 days ended before a
   cutoff, then scored on signups after it. `/v1/model` and the page show the
   out-of-time AUC and the share of payers found in the top 20%. With too few
   payers or non-payers to validate, it says so and calls the scores a ranking,
   not a forecast.
5. **Fallback.** Under 20 payers or 20 non-payers it does not train and shows a
   fixed engagement index, flagged `calibrated: false`.
6. **Who is scored.** Unpaid signups between 7 and 45 days old. Older free
   accounts are a different question (they are not leads any more).
7. **Reasons.** Each hot lead lists up to three behaviours pushing its score up,
   in words ("tried 5 different features").

The tests use a seeded synthetic dataset, where paying follows early engagement,
to prove the machinery finds a real signal when there is one (out-of-time AUC
above 0.7), and a pure-noise dataset to prove it does not claim one when there
is none. That says nothing about your product: your accuracy is whatever
`/v1/model` reports on your data.

## Run it

```
API_KEY=$(openssl rand -hex 16) ADMIN_KEY=$(openssl rand -hex 16) node server.mjs
```

| Variable | What |
|---|---|
| `API_KEY`, `ADMIN_KEY` | required, 16+ characters; the first is for your app, the second forces a retrain |
| `STATE` | state file, default `/tmp/state.json`; put it on a disk |
| `STRIPE_WEBHOOK_SECRET` | optional; verifies the Stripe webhook that records paid conversions |
| `ALERT_WEBHOOK_URL`, `ALERT_WEBHOOK_SECRET` | optional; a signed `lead.hot` POST, once per signup |
| `ALERT_FORMAT` | `json` (default), `slack` or `discord`: with the last two, point `ALERT_WEBHOOK_URL` at a Slack or Discord incoming webhook and hot leads arrive as a chat message, no glue code |

API (bearer `API_KEY`):

- `POST /v1/events` — `{id, account, type, timestamp?, signup?}` or `{events:[...]}` up to 500. Idempotent on `id`. The first event sets the signup time unless you send `signup`.
- `POST /v1/conversions` — `{account, convertedAt?}` records the first payment; `{account, converted:false}` undoes it.
- `GET /v1/hot-leads?limit=20` — signups at or above the threshold, with reasons.
- `GET /v1/leads/:id` — one signup's score.
- `GET /v1/model` — mode, sample sizes, skipped counts, out-of-time validation, weights.
- `POST /stripe/webhook` — a `customer.subscription.created` with `status: active`, or a
  `checkout.session.completed` with `payment_status: paid`, records a conversion for a
  signup the radar already knows. The account is `metadata.account_id`, else
  `client_reference_id`, else the Stripe customer id. An uncharged trial is not a
  conversion: call `POST /v1/conversions` when a trial first pays.
- `POST /v1/admin/retrain` — bearer `ADMIN_KEY`.

**Day-one history.** Export `account,date[,type]` rows from your analytics tool
(and `account,date` first payments from billing) and load them, so the first
model trains on your past instead of waiting months:

```
RADAR_URL=https://radar.example.com RADAR_API_KEY=... node import.mjs events.csv paid.csv
```

It is safe to re-run. The browser page takes the same two formats, so you can
see the accuracy before you deploy. In a CSV the first event stands in for the
signup time; send `signup` through the API if you have the real one.

`sdk.mjs` is a tiny fetch-based client: `radar.track("user_42", "import_data")`.

Alert signature: `x-radar-signature: sha256=HMAC(ALERT_WEBHOOK_SECRET, body)`.
Point the alert at something that acts: a Slack message, an email to you, a
sequence in [Drip Keeper](../drip-keeper/), or a trial email from
[Trial Converter](../trial-converter/).

## One-click deploy

Fork this repository, then open `https://render.com/deploy?repo=<your fork URL>`
(the blueprint is `render.yaml`; Render bills you, nothing runs on the author's
account). Or use the repository-wide deploy page. Docker:
`API_KEY=$(openssl rand -hex 16) ADMIN_KEY=$(openssl rand -hex 16) docker compose up -d`.
Fly.io: the steps are at the top of `fly.toml`.

## Limits

- The signal is first-week product usage. It cannot see budget, authority or
  company size; an engaged student looks like an engaged buyer.
- Needs history: roughly 20 payers and 20 non-payers to train, more to validate.
  Fewer signups than that get the engagement index.
- If your free plan has a hard cap that forces upgrades, usage and paying are
  partly the same thing; the score then says "hit the cap", not "will love it".
- Each account keeps its newest 5,000 events; one JSON file rewritten on every
  write is fine for tens of thousands of events a day, not millions.
- It never contacts anyone. Send ids you choose, not names or emails.

## Tests

`node --test`

## Disclaimer

Free and MIT, provided as-is with no warranty and no uptime guarantee. Scores
are statistical estimates and can be wrong. You run it, so you are responsible
for how you contact people, for backups and for your users' privacy. Not legal,
tax or financial advice. If it helps,
[sponsor the author](https://github.com/sponsors/Duncan-Haywood).

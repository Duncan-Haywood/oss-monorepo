# Deal Keeper

A sales pipeline forecaster for small B2B teams. It learns each stage's real win
rate from your own closed deals, gives a forecast range it has **backtested
against deals that were open in the past**, and ranks the stale, slipping or
stalled deals by the money at stake, so you know which call to make first.
MIT, one Node process, no dependencies, state in a JSON file.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/deal-keeper/

Try it on an export first: open `index.html` (nothing is uploaded; the page
makes no network requests).

## Why use this instead of what you have today

| Today | Problem for a small team | Deal Keeper |
|---|---|---|
| The forecast in Pipedrive, HubSpot, Close or Zoho | Generic stage percentages (10/25/50/75) that nobody checked against your deals; per-seat pricing; forecasting tiers are the expensive ones | Stage chances learned from your history, with the accuracy backtested and shown; no per-seat fee |
| Clari, Gong Forecast, Aviso | Revenue-intelligence platforms for large teams, priced in the thousands a month | One narrow job, free, your data stays on your server |
| A spreadsheet of deals times a gut-feel percentage | Never checked, and stalled deals keep their full weight | Time in stage lowers a deal's chance the way it did for your past deals |
| Twenty, Odoo, SuiteCRM (open-source CRMs) | A whole CRM to host and learn | Not a CRM: it sits next to the one you have and reads its export or webhooks |

If your team is thirty reps with a revenue-operations hire, buy a platform. This
is for the founder or small team that wants "what will close this quarter, and
which deals do I phone today".

## How it works

1. **Stage chances.** For each stage, among closed deals that got that far, the
   share that were won, pulled toward a generic default by 5 pseudo-deals so
   three lucky wins cannot claim 100%, and forced to be non-decreasing down the
   funnel. A won deal counts as having reached every stage.
2. **Time in stage.** A deal that has sat in its stage for `d` days is compared
   only with past deals that also stayed at least `d` days there (survival
   style). Needs exact stage dates.
3. **Honest label.** Under 20 closed deals, or under 5 won or 5 lost, the chances
   are labelled as defaults, not learned.
4. **Backtest.** Cut closed deals at their 70th-percentile close date, train only
   on those closed earlier, forecast the deals that were open at the cut using
   the stage each was in that day, and compare with how they ended: predicted
   wins against actual wins, and a Brier skill score against guessing your
   overall win rate. Needs about 30 closed deals with exact stage dates.
5. **Forecast range.** Probability-weighted value of open deals with a close date
   in the window, with a 10th to 90th percentile band. The band treats deals as
   independent, so it is **optimistic** when your deals move together (a
   downturn, one big customer).
6. **Hygiene flags**, ranked by probability times amount:
   `stale` (quiet longer than your won deals ever were; 14 days until you have 5
   won deals), `overdue`, `slipped` (close date pushed back twice or more),
   `no-next-step`, `slow` (longer in a stage than three quarters of your won
   deals), plus `no-amount` and `no-close-date`.

The tests use a seeded synthetic history where later stages win more often (the
backtest beats the base rate: skill above 0.1) and a pure-noise history where
stage does not matter (skill stays under 0.06), to prove the machinery finds a
signal when there is one and does not invent one. That says nothing about your
sales: your accuracy is whatever `/v1/model` reports on your data.

## Run it

```
API_KEY=$(openssl rand -hex 16) ADMIN_KEY=$(openssl rand -hex 16) node server.mjs
```

| Variable | What |
|---|---|
| `API_KEY`, `ADMIN_KEY` | required, 16+ characters; the first is for your tools, the second forces a retrain |
| `STATE` | state file, default `/tmp/state.json`; put it on a disk |
| `STAGES` | comma-separated stage names in order, first run only; default `lead,qualified,proposal,negotiation` |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `LLM_PROVIDER`/`LLM_MODEL`/`LLM_BASE_URL`/`LLM_API_KEY` | optional; your own key turns on model-written follow-up drafts (any OpenAI-compatible endpoint works; for a model on your own machine with no key, set `LLM_PROVIDER=ollama`, `lmstudio` or `llamacpp` and `LLM_MODEL`). Only the deal's name, stage, amount, next step and flags are sent to the provider |
| `PIPEDRIVE_STAGES`, `HUBSPOT_STAGES` | optional JSON maps from the CRM's stage ids to your stage names, for the webhook connectors below |
| `ALERT_WEBHOOK_URL`, `ALERT_WEBHOOK_SECRET` | optional; a signed POST once when a deal first goes `stale`, `overdue` or `slipped` |

API (bearer `API_KEY`):

- `POST /v1/deals` — `{id, name?, amount?, stage?, status?, createdAt?, closeDate?, nextStep?, lastActivityAt?}` or `{deals:[...]}` up to 500. Upsert by id. Changing `stage` records the move; `status: "won"|"lost"` closes it.
- `POST /v1/deals/:id/activity` — `{at?}` log a conversation. `DELETE /v1/deals/:id` removes a deal.
- `GET /v1/pipeline` — every open deal: chance, weighted value, flags, the reasons in words, and `fixFirst`.
- `GET /v1/forecast?from=&to=&target=` — weighted value with low/high band, likely (chance 60%+), won so far, and with a target the gap and coverage.
- `POST /v1/deals/:id/followup` — a draft follow-up note for an open deal, built from why it was flagged. With no key it is a template (`source: "fallback"`); with your own key it is written by the model (`source: "model"`). It is only a draft: you read, edit and send it yourself, and nothing is sent.
- `GET /v1/deals/:id` — one deal. `GET /v1/model` — mode, stage chances, backtest.
- `POST /v1/admin/retrain` — bearer `ADMIN_KEY`.

**Day-one history.** Export deals from your CRM as CSV with columns
`id,name,stage,amount,status,created,closed,close_date,last_activity,next_step,stage_since,stage_history`
(only id, stage and created are needed; `stage_history` is
`lead@2026-01-02;qualified@2026-01-10`) and load them:

```
DEALS_URL=https://deals.example.com DEALS_API_KEY=... node import.mjs deals.csv
```

Safe to re-run. Rows without `stage_history` still train the stage chances but
cannot feed the time-in-stage model or the backtest. Most CRMs can export
stage-change dates from their deal history report.

**Live sync from Pipedrive or HubSpot (no glue code).** Point the CRM's own
webhook at your server and the pipeline stays current:

- *Pipedrive*: Tools > Webhooks > add one for event `*.deal` (v1 or v2) to
  `https://<your host>/v1/webhooks/pipedrive`, HTTP auth with any user name and
  your `API_KEY` as the password. Set `PIPEDRIVE_STAGES='{"7":"qualified","8":"proposal"}'`
  to map Pipedrive stage ids to your `STAGES`. Deals are stored as `pd-<id>`.
- *HubSpot*: a deal workflow with the action "Send a webhook" (POST, JSON),
  URL `https://<your host>/v1/webhooks/hubspot?key=<API_KEY>`, sending the
  properties `hs_object_id, dealname, amount, dealstage, createdate, closedate, hs_is_closed, hs_is_closed_won`.
  Map stages with `HUBSPOT_STAGES='{"contractsent":"proposal"}'`. Deals are `hs-<id>`.

A stage the map does not know leaves the deal's stage alone and says so in the
response; unrelated events get a 200 so the CRM never disables the hook. Stage
moves are recorded when the webhook arrives, so run the CSV import first for
history. Anything else (Close, Zoho, a spreadsheet, Zapier/Make) can POST to
`/v1/deals`.

`sdk.mjs` is a tiny fetch-based client: `deals.upsert({...})`, `deals.activity(id)`.
Alert signature: `x-keeper-signature: sha256=HMAC(ALERT_WEBHOOK_SECRET, body)`.
Send it to Slack, email, or [Drip Keeper](../drip-keeper/).

## One-click deploy

Fork this repository, then open `https://render.com/deploy?repo=<your fork URL>`
(the blueprint is `render.yaml`; Render bills you, nothing runs on the author's
account). Docker:
`API_KEY=$(openssl rand -hex 16) ADMIN_KEY=$(openssl rand -hex 16) docker compose up -d`.
Fly.io: the steps are at the top of `fly.toml`.

## Limits

- It reads your pipeline; it does not know your buyers. A deal with a champion
  who just left looks the same as a healthy one until someone logs it.
- Needs history: about 20 closed deals to call chances learned, about 30 with
  exact stage dates to backtest. A team closing a few deals a quarter is better
  served by judgement.
- The forecast band assumes independent deals and is optimistic.
- Deals with no close date are left out of date-ranged forecasts and counted
  separately.
- One JSON file rewritten on every write is fine for thousands of deals, not
  millions. It never contacts anyone. Send ids you choose and short names, not
  contact details.

## Tests

`node --test`

## Disclaimer

Free and MIT, provided as-is with no warranty and no uptime guarantee. Win
chances and forecasts are statistical estimates and can be wrong; they are not a
promise of revenue. You run it, so you are responsible for how you contact
buyers, for backups and for your customers' privacy. Not legal, tax or
financial advice. If it helps,
[sponsor the author](https://github.com/sponsors/Duncan-Haywood).

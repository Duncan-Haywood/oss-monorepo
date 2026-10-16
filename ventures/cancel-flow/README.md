# cancel-flow

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/cancel-flow/>

After using this, you can now **put a smart exit flow between "Cancel
subscription" and Stripe, on your own server**: it asks why, offers the save
that fits the answer, cancels cleanly if the customer still wants out, and
tells you which reasons you are actually winning. That used to mean paying a
retention service a monthly fee that grows with your revenue and handing it
your customer list.

Two parts, both free and MIT:

- **`index.html`** — the customer's view of the flow for any reason, plan price
  and offer settings, plus a revenue estimate from your own numbers. Runs in the
  browser; nothing is uploaded.
- **`server.mjs`** — the service. One Node process, **zero dependencies**, state
  in one JSON file. It serves the hosted cancel page, applies the save offer or
  the cancellation in Stripe, and reports at `/v1/summary`.

## Why someone would use this

| Today | Cost / catch | Cancel Flow |
|---|---|---|
| Stripe customer portal cancellation survey + one retention coupon | Free, but one offer for every reason and little reporting | A different offer per reason, a cooldown, per-reason save rate |
| Churnkey, ProfitWell Retain, Brightback and similar | Paid, usually scaled to your MRR; your customers' data goes to a third party | Runs in your account, no fee, nobody else sees your customers |
| A flow you build yourself | Easy to get wrong: double discounts, canceling the wrong subscription, offers on trials | Signed links, ownership check, idempotent writes, cooldown, dry-run default |

Honest limits: the results dashboard is a single page on your own server (no accounts, no
history beyond the state file), and win-back emails are
plain-text only (off until you set `WINBACK_URL`). It does not claim a save rate; measure it on your own data.
If the Stripe portal's built-in survey already works for you, keep it.

## What it does

1. **Signed one-time-per-subscription links.** Your app calls
   `POST /v1/links {"subscription":"sub_..."}` (admin key) when a signed-in
   customer clicks Cancel and redirects them to the returned URL. The link
   expires (default 60 min) and the server checks with Stripe that the
   subscription belongs to the customer named in the link before changing
   anything.
2. **Asks why** (seven reasons that map to Stripe's `cancellation_details.feedback`
   values) and an optional comment.
3. **Offers the fit** (`flow.mjs`, overridable with `POLICY_JSON`):

   | Reason | Default offer |
   |---|---|
   | too expensive | 30% off for 3 months (annual plans: 30% off the next renewal only) |
   | switching to another product | 20% off for 3 months |
   | not using it enough / only need a break | pause billing 2 / 3 months (`pause_collection`, resumes on its own) |
   | something is not working | link to support, then cancel is still one click |
   | missing a feature / other | no offer; straight to cancel (you read the comment) |

   No discount to trialing customers; **one accepted save per customer per 365
   days** so nobody farms coupons; clamps (100% max, 12 months max) so a typo
   cannot give the product away.
4. **Cancels at period end** with the reason and comment attached to the
   subscription in Stripe. The customer keeps access until the date shown.
5. **Is replay-safe.** Each session ends once; Stripe writes carry idempotency
   keys; the webhook is de-duplicated; reloading the page does not start a second
   session.
6. **Wins back, if you turn it on.** Set `WINBACK_URL` (your pricing or
   sign-up page) and customers who cancelled through the flow get up to two
   plain-text emails after their subscription actually ends (default 14 and 60
   days), worded for the reason they gave. Each step is sent once; nothing goes
   to anyone who opted out or has already subscribed again; every email has a
   one-click unsubscribe (also as the `List-Unsubscribe` header) and your postal
   address (`COMPANY_ADDRESS`, which the law in many places requires). The
   second email can carry a code you create in Stripe (`WINBACK_CODE`). Dry-run
   logs what it would send. `/v1/summary` adds emailed, opted out and
   resubscribed. It claims no win-back rate; it counts yours.
7. **A/B tests offers.** Add `experiments` to `POLICY_JSON`, for example
   `{"experiments":{"too_expensive":{"variants":{"B":{"type":"discount","percent":15,"months":6}}}}}`.
   The offer in `offers` stays the control (arm A); customers are split evenly by a
   hash of customer and reason, so one customer always sees the same arm.
   `/v1/summary` then reports `experiments`: offers, saves, save rate and monthly
   revenue kept per arm, a two-sided two-proportion p-value, and a verdict that stays
   "keep collecting" until both arms have 30 offers and p < 0.05. Small shops will
   wait a long time for 30 per arm; treat early gaps as noise.
8. **Shows results at `/admin`.** Open `https://<your host>/admin`, paste `ADMIN_KEY`, and see
   save rate by reason, offer tests, win-back and recent sessions, plus a CSV export. The page holds
   no data and no key; the key stays in the tab and goes only to your server.
9. **Reports** `GET /v1/summary` (started, offered, saved, save rate, by reason,
   monthly revenue kept by discounts) and `GET /v1/sessions` (admin key).

## Run it

```sh
cd ventures/cancel-flow
node --test        # 53 tests, no network
STRIPE_SECRET_KEY=rk_test_... STRIPE_WEBHOOK_SECRET=whsec_... \
ADMIN_KEY=$(openssl rand -hex 16) LINK_SECRET=$(openssl rand -hex 16) \
PUBLIC_URL=https://cancel.example.com COMPANY_NAME=Acme node server.mjs
```

It starts in **DRY_RUN** (the default): the whole flow works and is recorded, the
page shows a "test mode" banner, and no subscription is changed. Walk through it
with a **test-mode** subscription, then set `DRY_RUN=false`.

Setup in Stripe:

1. Restricted key: Subscriptions write, Coupons write, Customers read.
2. Webhook endpoint `https://<host>/webhook/stripe` for
   `customer.subscription.deleted` (records true churn) and, for win-back,
   `customer.subscription.created`. Win-back also needs Customers read.
3. In your app, make the Cancel button call `/v1/links` server-side and redirect.
   The admin key must never reach the browser.

| Env | Purpose |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | required |
| `ADMIN_KEY` | bearer token for `/v1/*` |
| `LINK_SECRET` | signs the customer links |
| `PUBLIC_URL` | where this server is reachable (links are built from it) |
| `COMPANY_NAME`, `BRAND_COLOR`, `RETURN_URL` | page wording, `#rrggbb` accent, https "back to app" link |
| `POLICY_JSON` | override offers, e.g. `{"offers":{"too_expensive":{"type":"discount","percent":20,"months":2}},"cooldownDays":180,"supportUrl":"https://example.com/help"}` |
| `FRAME_ANCESTORS` | allow embedding the page in an iframe, e.g. `https://app.example.com` (default none) |
| `STATE` | path of the JSON state file |
| `WINBACK_URL` | turns win-back emails on; where the email sends people (https) |
| `RESEND_API_KEY`, `MAIL_FROM`, `COMPANY_ADDRESS` | needed to send win-back for real (`DRY_RUN=false`) |
| `WINBACK_CODE`, `WINBACK_CODE_TEXT` | optional code mentioned in the last email |
| `WINBACK_JSON` | e.g. `{"steps":[{"afterDays":7},{"afterDays":30}],"maxPerRun":25}` (1 to 4 steps, 1 to 365 days) |

Mint a link from your backend (any language, it is one HTTP call):

```sh
curl -s -X POST "$PUBLIC_URL/v1/links" -H "authorization: Bearer $ADMIN_KEY" \
  -d '{"subscription":"sub_123","ttlMinutes":30}'
```

## One-click deploy (your own account)

Fork this repository and open `https://render.com/deploy?repo=<your fork URL>`.
`render.yaml` builds the `Dockerfile` here in **your** Render account with a 1 GB
disk for the state file and generated `ADMIN_KEY` and `LINK_SECRET`. Nothing runs
on the author's side. Docker anywhere works too:
`docker build -t cancel-flow . && docker run -p 8080:8080 -v cf:/data -e STATE=/data/state.json ... cancel-flow`.

## Status and what is not verified

Everything in `node --test` passes against a fake Stripe. It has **not** been run
against live Stripe by the author: do that in test mode before going live.
Cancellation rules differ by country and state (some require cancelling to be as
easy as signing up); you are the operator. Keep a plain cancel path, and do not
make the offer step mandatory beyond one screen.

Files: `flow.mjs` (decisions, summary; also runs in the browser), `page.mjs` (hosted
page), `admin.mjs` (results dashboard), `winback.mjs` (win-back emails), `stripe.mjs` (webhook verification, API calls), `server.mjs` (HTTP shell),
`index.html` (simulator). Sibling venture for failed payments: `../dunning-engine`.

Support the project: <https://github.com/sponsors/Duncan-Haywood>.

## Other self-deploy paths

`docker-compose.yml` runs it on any box with Docker (the command is at its top). Fly.io: the steps are at the top of `fly.toml`. Both keep state on a volume and run in your own account.

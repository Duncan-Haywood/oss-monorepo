# referral-keeper

After using this, you can now **run a referral or affiliate program on your own Stripe account**: give partners a link, know which customer each one brought, pay commission only on what the customer really paid, and get a payout file when a balance is ready. That used to mean a monthly fee to an affiliate platform that scales with your revenue and sees every purchase.

Two parts, both free and MIT:

- **`index.html`**: a planner that shows what a partner program costs per referred customer from your own price, commission, window and churn. Runs in the browser; nothing is uploaded.
- **`server.mjs`**: the service. One Node process, **zero dependencies**, state in one JSON file. It reads Stripe webhooks, keeps the ledger, serves partner links and dashboards, and reports.

## Why someone would use this

| Today | Cost / catch | Referral Keeper |
|---|---|---|
| Affiliate platforms for Stripe (Rewardful, FirstPromoter, Tolt and similar) | Paid, usually a monthly fee that rises with tracked revenue; purchases flow through a third party | Runs in your account, no fee, no third party |
| A spreadsheet and a coupon per friend | No attribution, forgotten refunds, no hold period, no partner view | Links, first-touch attribution, refund reversal, partner dashboard |
| Building it yourself | Easy to double-pay on a replayed webhook or pay on tax and refunded sales | Idempotent per invoice, net of tax, cumulative-refund aware, tested |

Honest limits: it does not pay partners or file their tax forms, attributes by link and Stripe Checkout only (no coupon-code attribution), has no fraud scoring beyond self-referral checks and a hold period, and has not been run against live Stripe by the author. If a platform's features (multi-level commissions, automated PayPal payouts) matter more than owning your data, use one.

## What it does

1. **Partner links.** `https://<your-host>/r/<code>` counts the visit and redirects to your site with `?ref=<code>`. The destination must be on `LANDING_URL`'s host or a host in `LANDING_HOSTS` (never an open redirect). Unknown or suspended codes get the plain landing page.
2. **Attribution.** Put `<script src="https://<your-host>/rk.js" defer></script>` on your site. It stores the code in a first-party cookie (default 60 days, first touch wins) and tags Stripe Payment Links (`client_reference_id=rk_<code>`), `<stripe-pricing-table>` and `<stripe-buy-button>`. For your own Checkout Sessions, pass `client_reference_id: "rk_" + code` (from `window.referralCode()`), or put `referral=<code>` in the Customer's or Session's metadata.
3. **Commission** on `invoice.paid`, from the amount **paid before tax**, at the default rate (20%) or a partner's own rate, for the first N months after the customer's first paid invoice (default 12; `0` = lifetime). Annual plans count as one invoice. One-time Checkout payments without an invoice are covered too. Replays never pay twice.
4. **Refunds and chargebacks.** `charge.refunded` recomputes commission from the cumulative amount refunded; `charge.dispute.created` removes it. If the partner was already paid, a negative adjustment nets against the next payout.
5. **Hold and minimum.** Commission is "maturing" for 30 days, then "payable"; balances under the minimum (default 50.00) roll over. Currencies are never mixed.
6. **Self-referrals** (partner email equals the customer's email) earn nothing. Review partners before paying.
7. **Partner dashboard** at `/a/<code>.<signature>`: visits, sign-ups, paying customers, earned / maturing / payable / paid, recent entries. No customer names or emails are shown. The link is the login, so treat it as private.
8. **You pay, then record it.** `GET /v1/payouts.csv` lists who is due (spreadsheet formulas in names are neutralised). Send the money by PayPal, Wise or bank, then `POST /v1/payouts` to record it. The software never moves money.

## Run it

```sh
cd ventures/referral-keeper
node --test        # 40 tests, no network
STRIPE_WEBHOOK_SECRET=whsec_... ADMIN_KEY=$(openssl rand -hex 16) LINK_SECRET=$(openssl rand -hex 16) \
PUBLIC_URL=https://partners.example.com LANDING_URL=https://example.com/pricing \
COMPANY_NAME=Acme node server.mjs
```

Stripe setup: add a webhook endpoint `https://<host>/webhook/stripe` for `checkout.session.completed`, `customer.created`, `invoice.paid`, `charge.refunded`, `charge.dispute.created`. That is the only required connection. It **never writes to Stripe**.

Add partners (or turn on `OPEN_SIGNUP=true` and share `/join`; sign-ups are throttled but emails are not verified):

```sh
curl -s -X POST "$PUBLIC_URL/v1/affiliates" -H "authorization: Bearer $ADMIN_KEY" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","rate":0.3}'   # rate optional
curl -s "$PUBLIC_URL/v1/summary" -H "authorization: Bearer $ADMIN_KEY"
curl -s "$PUBLIC_URL/v1/payouts.csv" -H "authorization: Bearer $ADMIN_KEY"
curl -s -X POST "$PUBLIC_URL/v1/payouts" -H "authorization: Bearer $ADMIN_KEY" \
  -d '{"code":"ada-1x2y","currency":"usd","method":"paypal","reference":"PAYID-123"}'
curl -s -X POST "$PUBLIC_URL/v1/affiliates/ada-1x2y/status" -H "authorization: Bearer $ADMIN_KEY" -d '{"status":"suspended"}'
```

| Env | Purpose |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | required; verifies every webhook (5-minute tolerance) |
| `ADMIN_KEY`, `LINK_SECRET` | required; bearer token for `/v1/*`, and the key that signs partner dashboard links |
| `PUBLIC_URL`, `LANDING_URL` | required; where this server lives, and your https landing page |
| `LANDING_HOSTS` | extra allowed redirect hosts, comma separated (e.g. `app.example.com`) |
| `COMPANY_NAME`, `BRAND_COLOR` | page wording and `#rrggbb` accent |
| `OPEN_SIGNUP` | `true` enables `/join` (default off) |
| `POLICY_JSON` | e.g. `{"rate":0.25,"months":0,"holdDays":45,"minPayoutCents":10000,"cookieDays":90}` (values are clamped: rate 1-50%) |
| `STRIPE_SECRET_KEY` | optional restricted key, **Invoices: read** only; looks up payment ids on API versions that omit them from the invoice so refunds can be matched |
| `STATE` | path of the JSON state file |

## One-click deploy (your own account)

Fork this repository and open `https://render.com/deploy?repo=<your fork URL>`. `render.yaml` builds the `Dockerfile` here in **your** Render account with a 1 GB disk for the state file and generated `ADMIN_KEY` and `LINK_SECRET`. Nothing runs on the author's side. Docker anywhere works too: `docker build -t referral-keeper . && docker run -p 8080:8080 -v rk:/data -e STATE=/data/state.json ... referral-keeper`.

## Status and what is not verified

Everything in `node --test` passes against fake Stripe payloads. It has **not** been run against live Stripe by the author: replay events from Stripe's test mode before you promise a partner anything. Event shapes differ between Stripe API versions; if commission does not appear, check `invoice.paid` has `customer` and `amount_paid`. You are the operator: partner terms, advertising-disclosure rules (partners must disclose the relationship where the law says so), and tax reporting on what you pay partners (for example 1099 or VAT) are yours.

Files: `commission.mjs` (all the money rules; also runs in the browser), `stripe.mjs` (webhook verification, one read call), `page.mjs` (partner pages), `snippet.mjs` (the `/rk.js` script), `server.mjs` (HTTP shell), `index.html` (planner). Siblings: `../cancel-flow`, `../dunning-engine`.

Support the project: <https://github.com/sponsors/Duncan-Haywood>.

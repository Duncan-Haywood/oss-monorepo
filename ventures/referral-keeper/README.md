# Referral Keeper

After using this, you can now **run an affiliate or referral program on your own Stripe account**: affiliates share a link, the customers they bring earn them recurring commission, refunds and disputes claw it back, and you pay them from a CSV, with no monthly fee and no revenue share.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/referral-keeper/

Two parts, both free and MIT:

- **`index.html`**: a programme planner. Type your price, commission, window, churn and referral volume and see what the programme costs month by month. Runs in the browser; nothing is uploaded.
- **`server.mjs`**: one Node process, **zero dependencies**, state in one JSON file. It receives Stripe webhooks, keeps the ledger, serves the tracking script, a private dashboard per affiliate and an admin page. **It needs no Stripe API key and never calls Stripe or moves money.**

## Why someone would use this

| Today | Cost / catch | Referral Keeper |
|---|---|---|
| Rewardful, FirstPromoter, Tolt, PromoteKit and similar | Monthly fee or a share of tracked revenue; affiliates and customer data on their platform | Your server, no fee, one JSON file you own |
| A spreadsheet plus Stripe exports | Manual attribution, forgotten refunds, commissions paid twice | Attribution, windows, clawbacks and idempotency are automatic and tested |
| Stripe's own tools | No affiliate tracking or commission ledger | Reads the Stripe events you already have |

Honest limits: **it does not pay affiliates** (you pay from the CSV, then mark it paid), one admin key (no per-user logins), no affiliate marketplace, no multi-level commissions, no fraud scoring beyond self-referral and idempotency, attribution is last-click by default (`data-attribution="first"` for first-click), and attribution depends on the cookie or on you passing `client_reference_id`.

## How attribution works

1. Add `<script src="https://YOUR-SERVER/r.js" defer></script>` to your marketing site. A visit to `https://yoursite.com/?ref=ann` stores `ann` in a cookie **on your own domain** (60 days; `data-days`, `data-param` and `data-attribution="first"` change that) and counts one click.
2. Stripe **Payment Links** are tagged automatically (the script adds `client_reference_id=ref_ann` when the visitor clicks a `buy.stripe.com` link). For **Checkout Sessions** you create, pass `client_reference_id: "ref_" + code`. `referralKeeper.clientReferenceId()` gives you the value in the browser.
3. On `checkout.session.completed` the server attributes that Stripe customer (or, for guest checkout, that email) to the affiliate. The first affiliate keeps the customer. An affiliate's own email never earns.
4. Every `invoice.paid` for that customer earns `percent` of the amount paid **excluding tax**, for the first `months` payments (`0` = for life). One-time Checkout payments earn once.

## Money rules

- **Hold**: new commission becomes payable `holdDays` after the payment (default 30), so most refunds land before you pay.
- **Refunds** reduce the commission in proportion to the refunded share. **Disputes** withhold it, and a dispute you win restores it.
- **Clawbacks**: if the commission was already paid, the affiliate's balance goes negative and the next commissions absorb it.
- **Payouts**: one open payout per affiliate and currency once the payable balance reaches `minPayout`. Download `/admin/payouts.csv` (formula-injection-safe), pay it however you like, then mark it paid with a reference. A payout you did not send can be cancelled and its commissions become payable again.
- **Per-affiliate overrides** of percent and window, and manual adjustments over the API.

## Run it

```sh
cd ventures/referral-keeper
node --test        # no network
STRIPE_WEBHOOK_SECRET=whsec_... ADMIN_KEY=$(openssl rand -hex 16) \
PUBLIC_URL=https://refs.example.com SITE_URL=https://example.com \
PROGRAM_JSON='{"percent":20,"months":12,"holdDays":30,"minPayout":5000}' node server.mjs
```

Stripe webhook endpoint: `PUBLIC_URL/webhook/stripe` with `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. Create affiliates at `/admin` (any user name, `ADMIN_KEY` as the password), or `POST /admin/affiliates` with `Authorization: Bearer <ADMIN_KEY>` and JSON `{name, email, code?, percent?, months?}`. Each affiliate gets a private dashboard link (`/a/<token>`, also `.json`). `GET /v1/summary` gives totals.

Optional: `OPEN_SIGNUP=true` publishes `/join`; applicants start **pending** and earn nothing until you approve them. Other settings: `STATE` (JSON file path, keep it on a persistent disk), `PORT`, `COMPANY_NAME`, `TRUST_PROXY=true` behind a proxy, `HIDE_SPONSOR_LINK=true`. Money is stored as integer minor units; `minPayout` is in the same units (5000 = 50.00).

## One-click deploy

Fork the repository, then open `https://render.com/deploy?repo=<your fork URL>`. Render builds the Dockerfile in **your** account with a 1 GB disk and generates `ADMIN_KEY`; you paste the webhook signing secret and your public URL. Nothing runs on the author's accounts. The same Dockerfile runs on Fly.io, Railway or any VPS. Serve it over HTTPS only; the admin uses HTTP Basic auth.

## Disclaimer

No warranty; no uptime or delivery guarantee. You operate the programme and are responsible for your Stripe account, your terms with affiliates and customers, affiliate-disclosure rules (affiliates generally must disclose the relationship), any tax reporting on what you pay them, and data-protection rules. Commission figures come from Stripe events the server received; a missed or rejected webhook means a missed commission, so check against Stripe before paying. Not legal, tax or financial advice. MIT licensed. If it saves you a subscription, you can [sponsor the author](https://github.com/sponsors/Duncan-Haywood).

## Other self-deploy paths

`docker-compose.yml` runs it on any box with Docker (the command is at its top). Fly.io: the steps are at the top of `fly.toml`. Both keep state on a volume and run in your own account.

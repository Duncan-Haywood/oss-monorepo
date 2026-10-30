# Plan: turning on billing without leaking a payment key

Written 2026-10-30 at the owner's request ("I think I want to turn on billing
... like to start some for profit stuff. make a plan on how to do that without
having a leak of a stripe key or something through open source code injection
to the repo"). It is a plan only. Nothing here is switched on yet, and the steps
marked **owner** are ones only the account holder can take.

## Why this repo needs more than "put the key in a secret"

The usual advice (keep `sk_live_...` in an env var or a GitHub Actions secret)
is not enough here, because of three facts about how this repository works:

1. **Agents merge to `main` with no human review gate** (`CLAUDE.md`, "Ship
   without review ceremony"), and the cross-review bots can auto-merge.
   Whatever code holds a secret at runtime can be changed by a merged PR.
2. **Agents read untrusted text.** Issues, fork PRs, comments and fetched web
   pages can carry instructions. One successful prompt injection into one
   session is enough to land a commit.
3. **Same-repo branches get repository secrets.** Agent sessions push
   branches to this repo, not forks, so a `pull_request` workflow on an agent
   branch runs *with* the repo's Actions secrets before anything is merged.
   Fork PRs get no secrets, but that guard does not cover our own branches.

And one fact about Cloudflare: a Workers API token is scoped to an *account*,
not to a script. Anyone who can deploy to the account can ship a Worker that
reads `env.STRIPE_SECRET_KEY` and sends it somewhere. Worker secrets cannot be
read back through the API, but they can be read by code you deploy. The repo's
`CLOUDFLARE_API_TOKEN` is already reachable from Actions
(`.github/workflows/edge-deploy.yml`, `portfolio-pages.yml`).

**So the rule the plan is built on: no code that an agent can change, and no
credential that an agent's CI can reach, may ever see a live Stripe secret.**
Env vars and Actions secrets in *this* repo do not meet that bar.

## Recommended design (in order of preference)

### Option A: hosted checkout, no secret anywhere (start here)

Sell through **Payment Links** (Stripe) or a merchant of record's hosted
checkout (Lemon Squeezy, Paddle, Polar). The public site only carries a
*link*. A link is not a secret: the worst a malicious PR can do is swap it
for someone else's link, which is visible in the diff and in the Stripe
dashboard (sales stop arriving).

- Fulfilment without a key: for a one-off digital product, the checkout's own
  confirmation page or receipt email delivers it (a download link or a
  licence code that the provider generates).
- Licence checks without a key: Lemon Squeezy and Polar offer a licence-key
  **validate** endpoint that needs no secret on the caller's side, so a
  product page can check a licence without holding anything (confirm in
  their current docs before relying on it).
- What leaks if everything in the public repo is compromised: nothing that
  moves money or reads customer data.

**Merchant of record vs plain Stripe.** With plain Stripe the owner is the
merchant: sales tax, EU/UK VAT on digital services (from the first sale for
EU buyers), refunds, chargebacks and receipts are the owner's. A merchant of
record (Lemon Squeezy, Paddle, Polar) is the seller of record, collects and
remits those taxes, and takes a larger fee (roughly 4 to 5% plus 40 to 50¢
against Stripe's 2.9% + 30¢ in the US; check current pricing). For a first product sold worldwide, a
merchant of record is the lower-risk start. This is the owner's call
(`portfolio/ledger/asks.yaml`, row `payout-rail`).

### Option B: a separate, private billing service (when you need subscriptions or server-side entitlements)

When a product needs things a link cannot do (metered usage, "is this user
subscribed?", seat counts), move every key-holding part out of reach:

- **A private repo** (for example `billing-service`, not a fork of this one)
  holding one small Cloudflare Worker. Branch protection with a required
  review *by the owner*, no agent write access, no auto-merge, and no
  Claude/automation tokens installed on it.
- **A separate Cloudflare account** for that Worker, so the public repo's
  `CLOUDFLARE_API_TOKEN` cannot deploy over it. Its deploy token lives only in
  the private repo, behind a GitHub **environment with a required reviewer**.
- **A Stripe restricted key** (`rk_live_`), not the full secret key, with only
  the permissions the Worker uses: Checkout Sessions write, Customers and
  Subscriptions read, Webhook endpoints none. No Refunds, Payouts, Transfers,
  Balance or Connect. A leaked restricted key then cannot refund money out or
  move funds.
- A **narrow HTTP API**, the only thing public code calls:
  `POST /checkout {product}` (the server maps the product to a price id from
  its own allowlist; never take a price or amount from the client),
  `GET /entitlement` (a signed token, not raw Stripe data), and
  `POST /webhook` (verified with the Stripe signing secret, also only in
  the private Worker).
- Public products keep the existing pattern (`PRODUCT_PLAYBOOK.md` §6):
  billing is off by default and the base URL of the billing service is a
  non-secret env var. Forks still pay nobody until they set their own.

What leaks if the public repo is fully compromised: the attacker can point
the product at a different billing URL (visible, reversible). They cannot
read the key, deploy the billing Worker, or change its code.

### What not to do

- No live Stripe key, webhook secret or MoR API key in this repo's Actions
  secrets, Cloudflare account, `.env` files, or Claude environment secrets.
- No live key pasted into any Claude session, issue, PR or chat. Agents set
  up code against **test-mode** keys only (`sk_test_...`), and only in the
  private repo.
- No Worker in the public Cloudflare account that holds a live key, even "just
  for now".

## Detection and blast-radius limits (both options)

1. **GitHub secret scanning with push protection** (free on public repos;
   Stripe is a scanning partner, so Stripe is told and can revoke a pushed
   live key). **Owner:** Settings → Code security → confirm "Secret scanning"
   and "Push protection" are on.
2. **The repo's own gate** already fails CI on a live Stripe key or a
   hardcoded payment link in `ventures/` (`platform/ci/check_payment_keys.py`).
   Keep it. If Option A puts a link on the owner's own instance, set it as a
   build-time variable from the owner's private config rather than committing
   it, so the check and the "forks pay nobody" rule both still hold.
3. **Stripe dashboard:** turn on email alerts for new API keys, failed
   webhook deliveries, refunds and disputes; set a payout schedule with a
   delay; enable 2FA (a hardware key if possible) on Stripe, Cloudflare and
   GitHub. Roll the restricted key on a calendar reminder and immediately
   if anything looks odd.
4. **Optional human gate in this repo:** a `CODEOWNERS` rule plus a ruleset
   requiring the owner's review only for paths that touch billing
   (`**/billing/**`, `.github/workflows/*deploy*`). This is one narrow
   exception to "no review ceremony", justified because it guards money; the
   owner decides whether it is worth the friction.

## Steps, in order

| # | Who | Step |
|---|---|---|
| 1 | **owner** | Decide Option A with a merchant of record, or plain Stripe (who is the merchant, tax duties). Answers `payout-rail` in the decision queue. |
| 2 | **owner** | Amend `prompts/goals.md`, "Payments: never the owner's", in your own words: today it forbids wiring the owner's payment account into anything, and every agent run is told to enforce it. Agents should not edit that guardrail on your behalf. |
| 3 | **owner** | Create the merchant account, enable 2FA, confirm secret scanning and push protection are on. |
| 4 | agent | Pick the first product to charge for and add an off-by-default "Buy" path that reads a checkout URL from config (test-mode link first), with refund policy, terms and the existing disclaimer on the page. |
| 5 | **owner** | Paste the live checkout link into the owner-only config (Cloudflare dashboard variable or the private repo), not into this repo. |
| 6 | agent | A real end-to-end purchase in test mode, then one live purchase by the owner, refunded. Record the result in the product's README. |
| 7 | later | Only if a product needs subscriptions: build Option B in the private repo, with the owner reviewing its PRs. |

## What this plan does not settle

- Which product to charge for first. The flagships
  (`portfolio/flagships.yaml`) are where the depth is; a hosted tier of
  `ai-bookkeeper` is one candidate, but a paid tool that touches tax or
  accounts needs the disclaimer and a clear refund policy, and it raises the
  bar on accuracy claims.
- Pricing and positioning; the evidence in `portfolio/ledger/break-even.md`
  says current measured demand is small, so start with one product and
  measure before building Option B.

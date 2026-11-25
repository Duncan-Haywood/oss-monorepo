# platform/billing: one Paddle checkout and licence path for every paid pack

Seven tools carry a paid add-on built "dark" in November 2026: the branded bid
package (wall-framing-takeoff), season print pack (league-schedule-generator),
staff schedule pack (shift-roster-builder), shed build pack (shed-designer),
audit pack (einvoice-preflight), change report (changepoint-detector) and close
pack (ai-bookkeeper). All seven called Lemon Squeezy's public licence-validate
endpoint, but the portfolio's merchant of record is **Paddle** (owner,
2026-11-24), and Paddle has no public licence check. This directory replaces
that path with one that works on Paddle and holds no Paddle API key.

## How a sale works

```
page (Buy)  --Paddle.js overlay, customData {claim}-->  Paddle
Paddle      --transaction.completed webhook-------->  edge Worker /billing/paddle
                                                      checks Paddle-Signature,
                                                      signs an Ed25519 licence key,
                                                      stores it under SHA-256(claim)
page        --GET /billing/claim?c=<claim>--------->  edge Worker -> the key
page (Unlock) verifies the key offline against the public key in checkout.mjs
```

- **The claim code** is 128 random bits made in the buyer's browser and passed
  to Paddle as `customData`. Only that browser knows it, so only it can collect
  the key. The Worker stores its hash, not the code.
- **The product comes from the price paid**, never from `customData`, so a
  browser cannot buy the cheapest price and claim another pack.
- **A key** is `ms1.<payload>.<signature>`: product, Paddle transaction or
  subscription id, issue time and, for a subscription, an expiry a week after
  the paid period ends. No email, name or address. A lapsed subscription key
  asks `POST /billing/renew` for the newest key its subscription earned.
- **One-off keys never expire and cannot be revoked** after a refund. The code
  is MIT; the key is a convenience for honest buyers, not copy protection, and
  the pages already say so.
- Paddle retries a webhook until it gets a 2xx, so a retry keeps the first key
  and an event we do not act on is still answered 200.

## Files

| file | runs in | what |
| --- | --- | --- |
| `client.mjs` | browser, Node | `wireBuy` (overlay checkout + key pickup), `verifyLicence`, `checkKey` (with renewal), `onSale`. No imports, so it can be copied. |
| `server.mjs` | edge Worker, Node | `verifyPaddleSignature`, `signLicence`, `licenceForTransaction`, `handleBilling` routes, `d1Store`. WebCrypto only. |
| `catalogue.mjs` | everywhere | what is sold: product, billing, Paddle price id; the shared public values. |
| `sync.mjs` | Node | copies `client.mjs` to `ventures/<slug>/paddle.mjs` and writes each `checkout.mjs` from the catalogue (`--check` for CI). |
| `keygen.mjs` | Node, once | the Ed25519 key pair. |
| `testkit.mjs` | tests | the contract each venture's `licence.mjs` test asserts in one line. |
| `billing.test.mjs` | tests | signature, signing, the webhook-to-unlock path, renewals, refusals, sync. |

The routes are mounted in `platform/edge/worker.mjs`; the two tables
(`licences`, `licence_subs`) are in `platform/edge/schema.sql`, applied by the
edge deploy.

## Going live (owner, once for all seven packs)

Everything an agent could do is done. These steps need the Paddle account or a
secret, so they are the owner's. Do them in the **sandbox** first.

1. **Keys.** `node platform/billing/keygen.mjs`. Put the public key in
   `catalogue.mjs` (`publicKey`). Paste the private key into
   `cd platform/edge && npx wrangler secret put LICENCE_SIGNING_KEY` and the
   password manager, nowhere else.
2. **Client-side token.** Paddle > Developer tools > Authentication >
   Client-side tokens > New. It starts `test_` (sandbox) or `live_`. Paste it
   into `catalogue.mjs` (`clientToken`). It is public by design. Never paste
   an API key there; the test refuses anything else.
3. **Notification destination.** Paddle > Developer tools > Notifications >
   New destination: URL `<edge>/billing/paddle` (the `edge` value in
   `catalogue.mjs`), event `transaction.completed`. Copy its secret key into
   `npx wrangler secret put PADDLE_WEBHOOK_SECRET`.
4. **Products and prices.** One product per pack, priced as
   `portfolio/monetization/models.yaml` says (wall-framing-takeoff is a yearly
   subscription; the rest are one-off). Paste each `pri_...` id into its row in
   `catalogue.mjs`. (An agent can turn this step into a script; see "Next".)
5. **Approve the domain.** Paddle > Checkout > Website approval:
   `marisstella.app`, where the tool pages are served.
6. `node platform/billing/sync.mjs`, run the venture tests, merge. Redeploy the
   edge Worker (Actions > `priv-edge-deploy` > Run workflow): it only
   redeploys on its own on changes under `platform/edge/`, and it reads the
   price ids from `catalogue.mjs`.
7. Buy each pack once in the sandbox with Paddle's test card, check the key
   unlocks, then switch `environment` to `"production"`, swap in the `live_`
   token, the live destination secret and the live price ids, and repeat once
   with a real card and a refund.

Until all of steps 1 to 4 are done for a pack, `onSale` is false and the page
shows no Buy button. Nothing is for sale and nothing changes for users.

## What is not verified

Paddle's documentation host does not resolve from the cloud sessions that wrote
this, so these come from memory of Paddle Billing's docs, checked against each
other and against `ventures/webhook-relay/verify.mjs`, which implements the same
signature scheme: the `Paddle-Signature: ts=..;h1=..` HMAC over `ts:body`; the
`transaction.completed` payload fields used (`id`, `status`, `items[].price.id`
or `price_id`, `custom_data`, `subscription_id`, `billing_period.ends_at`);
Paddle.js v2's `Initialize({token, eventCallback})`, `Environment.set`,
`Checkout.open({items, customData})` and the `checkout.completed` event. The
sandbox purchase in step 7 is the test of all of them. If a field name differs,
the fix is in `server.mjs` (`licenceForTransaction`) or `client.mjs` (`wireBuy`)
and their tests.

## Next

- The Paddle catalogue as code: a script that, given the owner's API key in an
  environment variable on the owner's machine, creates the products and prices
  from `catalogue.mjs` and `models.yaml` idempotently and writes the price ids
  back (goals.md, "Minimise click ops").
- `quick-pick-survey`'s results report is the eighth dark pack. It is a Next.js
  server app with its own `reportAccess.ts`, so it can call `verifyLicence`
  from `client.mjs` server-side; not done here.
- The platform-wide paid tier (`platform-pro-tier` in `portfolio/work/tasks.yaml`)
  can reuse this path: a subscription product whose key unlocks every tool.

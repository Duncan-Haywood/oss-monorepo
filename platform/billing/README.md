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
Paddle      --transaction.completed webhook-------->  billing Worker /billing/paddle
                                                      checks Paddle-Signature,
                                                      signs an Ed25519 licence key,
                                                      stores it under SHA-256(claim)
page        --GET /billing/claim?c=<claim>--------->  billing Worker -> the key
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
  is source available (FSL-1.1-MIT); the key is a convenience for honest buyers, not copy protection, and
  the pages already say so.
- Paddle retries a webhook until it gets a 2xx, so a retry keeps the first key
  and an event we do not act on is still answered 200.

## Files

| file | runs in | what |
| --- | --- | --- |
| `client.mjs` | browser, Node | `wireBuy` (overlay checkout + key pickup), `verifyLicence`, `checkKey` (with renewal), `onSale`. No imports, so it can be copied. |
| `server.mjs` | billing Worker, Node | `verifyPaddleSignature`, `signLicence`, `licenceForTransaction`, `handleBilling` routes, `d1Store`. WebCrypto only. |
| `catalogue.mjs` | everywhere | what is sold: product, billing, Paddle price id; the shared public values. |
| `sync.mjs` | Node | copies `client.mjs` to `ventures/<slug>/paddle.mjs` and writes each `checkout.mjs` from the catalogue (`--check` for CI). |
| `keygen.mjs` | Node, once | the Ed25519 key pair. |
| `testkit.mjs` | tests | the contract each venture's `licence.mjs` test asserts in one line. |
| `billing.test.mjs` | tests | signature, signing, the webhook-to-unlock path, renewals, refusals, sync. |

| `worker.mjs`, `schema.sql`, `wrangler.example.toml` | the owner's billing account | the billing Worker: the routes above over D1. |

## Where the billing Worker runs, and why not on the site's edge Worker

The billing Worker holds two secrets: Paddle's notification secret and the
licence signing key. The Payments guardrail (`prompts/goals.md`) keeps every
webhook secret out of this repository, its Actions secrets, the public
Cloudflare account and any agent session, and the billing plan's Option B
(`docs/reports/2026-10-30-billing-plan.md`) explains why: agents merge here
without review, and anything an agent can merge into a Worker can read that
Worker's secrets. So:

- the public site's edge Worker (`platform/edge/`) does **not** mount these
  routes, and a test fails if it ever imports them;
- nothing in `.github/workflows/` deploys `worker.mjs` or names its secrets
  (also tested), and there is no `wrangler.toml` here, only the example;
- the owner deploys it from an owner-only place (a private repository with
  owner review, or their own machine) to a **separate Cloudflare account**,
  reading the diff of `platform/billing/` since the last deploy first.

Neither secret can move money or read customer data. A leaked one lets
someone mint keys for code they could already run, which is the same as
the honest-buyer caveat above.

## Going live (owner, once for all seven packs)

Everything an agent could do is done. These steps need the Paddle account or a
secret, so they are the owner's. Do them in the **sandbox** first.

0. **The billing Worker.** On a Cloudflare account that is not the public
   site's: copy `worker.mjs`, `server.mjs`, `client.mjs`, `catalogue.mjs`,
   `schema.sql` and `wrangler.example.toml` (as `wrangler.toml`) to an
   owner-only place, `npx wrangler d1 create billing`, paste the id,
   `npx wrangler d1 execute billing --remote --file schema.sql`,
   `npx wrangler deploy`. Put its `https://...workers.dev` origin in
   `catalogue.mjs` (`edge`).
1. **Keys.** `node platform/billing/keygen.mjs` on your own machine. Put the
   public key in `catalogue.mjs` (`publicKey`). Paste the private key into
   `npx wrangler secret put LICENCE_SIGNING_KEY` (billing account) and the
   password manager, nowhere else: not a session, an issue or this repo.
2. **Client-side token.** Paddle > Developer tools > Authentication >
   Client-side tokens > New. It starts `test_` (sandbox) or `live_`. Paste it
   into `catalogue.mjs` (`clientToken`). It is public by design. Never paste
   an API key there; the test refuses anything else.
3. **Notification destination.** Paddle > Developer tools > Notifications >
   New destination: URL `<edge>/billing/paddle` (the billing Worker's origin
   from step 0), event `transaction.completed`. Copy its secret key into
   `npx wrangler secret put PADDLE_WEBHOOK_SECRET` (billing account).
4. **Products and prices.** One product per pack, priced as
   `portfolio/monetization/models.yaml` says (wall-framing-takeoff is a yearly
   subscription; the rest are one-off). Paste each `pri_...` id into its row in
   `catalogue.mjs`. (An agent can turn this step into a script; see "Next".)
5. **Approve the domain.** Paddle > Checkout > Website approval:
   `marisstella.app`, where the tool pages are served.
6. `node platform/billing/sync.mjs`, run the venture tests, merge. Redeploy
   the billing Worker from its owner-only place with the updated
   `catalogue.mjs`: it maps price ids to products from that file.
7. Buy each pack once in the sandbox with Paddle's test card, check the key
   unlocks, then switch `environment` to `"production"`, swap in the `live_`
   token, the live destination secret and the live price ids, and repeat once
   with a real card and a refund.

8. Before a pack goes live, an agent updates that tool's privacy line: once
   live, pressing Buy loads Paddle.js from `cdn.paddle.com` and Paddle collects
   the buyer's payment details as merchant of record; the page itself still
   sends nothing until then, and the billing Worker stores no personal data.

Until all of steps 0 to 4 are done for a pack, `onSale` is false and the page
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

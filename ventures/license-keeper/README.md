# license-keeper

After using this, you can now **sell a desktop app, plugin or CLI tool through
Stripe and have license keys issued, limited per machine, renewed with the
subscription and revoked on refund, on your own server**, which used to mean
paying a licensing platform per license or writing the plumbing yourself.

Two parts, both free and MIT:

- **`index.html`**: generate an Ed25519 key pair, sign a test license and verify
  any key, in the browser. Nothing is uploaded.
- **`server.mjs`**: the license server. One Node process, **zero dependencies**,
  state in one JSON file. It receives Stripe webhooks, issues and emails keys,
  enforces machine limits, and answers your app's activation calls.

## Why someone would use this

| Today | Cost / catch | License Keeper |
|---|---|---|
| Keygen, Cryptlex, LicenseSpring, Paddle licensing | Paid, usually priced by licenses or activations; your customer list lives on their platform | Runs in your account, no per-license fee |
| Lemon Squeezy / Gumroad built-in keys | Easy, but keys are random strings only their API can check, and you pay the platform's cut | Keys are signed, so the app verifies them with no network |
| A script you write yourself | Easy to get wrong: replayed webhooks issuing twice, refunds not revoking, renewals not extending | Idempotent, tested state machine; dry-run by default |

Honest limits: no web portal for customers (they use the key from their email;
you can re-send it with `POST /v1/licenses/<id>/resend`), no tax or invoicing
(Stripe does that), no seat management beyond a machine count, and no
copy protection: a key is a deterrent, and anyone can patch software they
hold. It is **not yet run against live Stripe** by the author; use test mode
first.

## How a key works

`LK1.<claims>.<signature>`: the claims (product, email, plan, features, machine
limit, expiry) are JSON, signed with Ed25519. Your app embeds the **public
key** and verifies offline. See `token.mjs` (about 60 lines; WebCrypto, runs in
Node 20+ and browsers). In any language, verifying means checking an Ed25519
signature over the ASCII text `LK1.<claims>` (everything before the last dot)
with the raw 32-byte public key. The token format was cross-checked against
OpenSSL (`openssl pkeyutl -verify -rawin`) in the session that built it.

Subscriptions get a short-lived token (billing period plus `GRACE_DAYS`, default
3). The app calls `/v1/validate` now and then; while the subscription is paid
the server returns a fresh token with a later expiry, and once it lapses it
does not.

## Run it

```sh
cd ventures/license-keeper
node --test        # no network
STRIPE_SECRET_KEY=rk_test_... STRIPE_WEBHOOK_SECRET=whsec_... ADMIN_KEY=$(openssl rand -hex 16) \
PLANS_JSON='{"price_123":{"product":"myapp","plan":"pro","features":["export"],"machines":2,"days":null}}' \
node server.mjs
```

It starts in **DRY_RUN** (the default): licenses are issued and logged, no
email goes out. First start generates a signing key pair and prints the public
key to embed in your app; it is stored in the state file (mode 600), or supply
`SIGNING_PUBLIC_KEY` and `SIGNING_PRIVATE_KEY` yourself. **Back up the key.**

Setup in Stripe:

1. Restricted key: Checkout Sessions read, Subscriptions read. Nothing is written.
2. Webhook endpoint `https://<host>/webhook/stripe` for
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `invoice.paid`, `customer.subscription.deleted`, `charge.refunded`,
   `charge.dispute.created`.
3. `PLANS_JSON` maps each Stripe **price id** to what it grants:
   `{"product","plan","features":[],"machines":1,"days":null}`. `days: null` is
   perpetual; a number is a fixed term from purchase. Subscription prices follow
   the billing period instead. Quantity multiplies the machine count.

API (JSON):

| Call | Who | Does |
|---|---|---|
| `GET /v1/pubkey` | anyone | the public key |
| `POST /v1/activate` `{license, fingerprint, name}` | your app | registers the machine (up to the limit); returns a fresh token |
| `POST /v1/validate` `{license, fingerprint}` | your app | still valid? returns a fresh token |
| `POST /v1/deactivate` `{license, fingerprint}` | your app | frees the machine slot |
| `POST /v1/licenses` `{product,email,plan,machines,expiresAt}` | admin | issue by hand (PayPal, bank transfer, giveaways) |
| `GET /v1/licenses`, `GET /v1/summary` | admin | list, counts |
| `POST /v1/licenses/<id>/revoke`, `/resend`, `GET .../token` | admin | revoke, re-email, fetch the key |

Admin calls use `Authorization: Bearer $ADMIN_KEY`. Public calls are rate limited
per address. Responses reveal a reason (`revoked`, `expired`, `machine-limit`,
`not-activated`).

| Env | Purpose |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_KEY`, `PLANS_JSON` | required |
| `RESEND_API_KEY`, `MAIL_FROM` | key emails (needed when `DRY_RUN=false`) |
| `COMPANY_NAME` | signs the email |
| `GRACE_DAYS` | extra days after a paid period ends (default 3) |
| `SIGNING_PUBLIC_KEY`, `SIGNING_PRIVATE_KEY` | bring your own Ed25519 pair (base64url raw / PKCS8) |
| `STATE` | path of the JSON state file |

## One-click deploy (your own account)

Fork this repository and open `https://render.com/deploy?repo=<your fork URL>`.
`render.yaml` builds the `Dockerfile` here in **your** Render account with a 1 GB
disk for the state file and generates `ADMIN_KEY`. Nothing runs on the author's
side. State must survive restarts (licenses, activations and the signing key
live in it), so this uses an instance with a disk. Docker anywhere works too:
`docker build -t license-keeper . && docker run -p 8080:8080 -v lk:/data -e STATE=/data/state.json ... license-keeper`.
Put it behind HTTPS (Render does).

## Status and what is not verified

`node --test` passes against a fake Stripe, and the page was exercised in
headless Chromium (sign, verify, tamper detection, no axe violations). Not run
against live Stripe, and no real email sent. Email, refund and data-protection
rules differ by country; you are the operator and responsible for them.

Files: `token.mjs` (sign/verify; also runs in the browser), `store.mjs` (license
state machine), `engine.mjs` (Stripe events to licenses), `stripe.mjs` (webhook
verification, read calls), `server.mjs` (HTTP shell), `index.html` (key lab).
Related ventures, same buyer: [dunning-engine](../dunning-engine/),
[cancel-flow](../cancel-flow/), [mrr-pulse](../mrr-pulse/).

Support the project: <https://github.com/sponsors/Duncan-Haywood>.

## Other self-deploy paths

`docker-compose.yml` runs it on any box with Docker (the command is at its top). Fly.io: the steps are at the top of `fly.toml`. Both keep state on a volume and run in your own account.

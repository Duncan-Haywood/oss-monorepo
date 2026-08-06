# local-site-studio secrets and build inputs

This venture holds the most complete commerce code in the portfolio — Stripe
Checkout, a webhook, a billing portal, one-shot price bootstrap, and a
`checkout_sessions` / `commerce_orders` schema. `deployment.yaml` currently
declares **no `env:` block at all**, so none of it is reachable in the cluster.

That gap is registered in `platform/k8s/deployment-env-coverage.yaml` and held
open by `platform/ci/test/deployment-env-coverage.test.mjs`. This file is the
other half: the itemised list of what a human has to provision, so closing the
gap is a checklist rather than a rediscovery.

Nothing in this repository contains a value for any key below, and nothing
should.

## Read this first: two of these cannot come from the Deployment

The keys split into two groups that arrive by completely different routes, and
conflating them is the reason this is written down.

**Build-time (`NEXT_PUBLIC_*`).** Next.js substitutes these into the client
bundle during `npm run build`. A `secretKeyRef` in `deployment.yaml` for one of
them would look like configuration and change nothing — the worst kind of
failure, because the manifest reads as correct. They arrive as Docker build
args. `ventures/local-site-studio/Dockerfile` declares each as a defaultless
`ARG` forwarded to `ENV`; `.gitea/workflows/local-site-studio-image.yml` must
pass `--build-arg` for the ones you want baked in, and **passes none today**.

**Runtime.** Everything else. These belong in a Kubernetes Secret named
`local-site-studio-secrets`, provisioned out of band — the arrangement
`print-atelier-secrets` and `quick-pick-secrets` already use. Do not commit a
Secret manifest into this directory; ArgoCD syncs it, so the values would
become the live credential set and sit in git history.

## Why no defaults, anywhere

This portfolio has already shipped the placeholder defect twice.
`ventures/print-atelier/src/lib/fulfillment-order-inputs.ts` carried
`?? "123 Market St"`, which became the real delivery address on every paid
order. This venture's own `.env.example` records the second:
`NEXT_PUBLIC_PREVIEW_DOMAIN` used to default to `preview.localsitestudio.com`,
**a domain registered to an unrelated third party**.

So every value here is absent until a human sets it, and the code is written to
refuse rather than guess — `src/lib/seo/app-url-env-readiness.ts`,
`src/lib/email/canspam-footer.ts` and the other readiness assessors turn an
unset value into a visible dashboard banner and a refusal, not a fallback.
Preserve that. Do not add a default to make a banner go away.

## The money-path item, stated plainly

`NEXT_PUBLIC_CONVEX_URL` is the one that decides whether a paid order survives.

`src/lib/db.ts` constructs the Convex client only when that URL resolves, and
falls back to SQLite at `process.cwd()/local.db` when it does not. In a
container that path is **ephemeral**: every `checkout_sessions` and
`commerce_orders` row is lost on pod restart, rescale or reschedule, with no
error raised. The venture's own `.env.example` says it is "required before first
paid order on Vercel / multi-instance".

It is a `NEXT_PUBLIC_*` value, so it is a **build arg, not a Secret key**. An
image built without it cannot be fixed by any Deployment change.

## Build args — passed to `docker build`, baked into the image

| Build arg | Where to get it | What happens if it is empty |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | Convex dashboard → deployment URL | SQLite-only. Paid orders lost on pod restart. **Set before taking a payment.** |
| `NEXT_PUBLIC_APP_URL` | The public origin this is served on | `sendEmail` refuses to transmit (the CAN-SPAM unsubscribe link would be unreachable); sitemap/robots/canonical point at localhost. |
| `NEXT_PUBLIC_COMPANY_ADDRESS` | The real postal address of the legal entity | `sendEmail` refuses. CAN-SPAM requires a physical postal address in outreach. |
| `NEXT_PUBLIC_BRAND_NAME` | Owner decision | Customer-facing brand is blank. |
| `NEXT_PUBLIC_PRODUCTION_DOMAIN` | A public root you own | Deploy handoffs carry no suggested host and no DNS instructions; the go-live email is refused rather than pointing DNS somewhere arbitrary. |
| `NEXT_PUBLIC_PREVIEW_DOMAIN` | A domain **this venture owns** | Empty. Do not guess — the previous default belonged to a third party. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | A monitored mailbox | Support route is blank. |
| `NEXT_PUBLIC_LEGAL_ENTITY`, `NEXT_PUBLIC_LEGAL_LOCATION` | Registered entity details — do not change without counsel | Stripe/contract/compliance surfaces are blank. |
| `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_COMPANY_NAME`, `NEXT_PUBLIC_DBA_NAME`, `NEXT_PUBLIC_COMPANY_LOCATION` | Owner decision; DBA only if filed | Cosmetic. |

## Secret keys — `local-site-studio-secrets`, runtime

| Key | Where to get it | What breaks without it |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys | No checkout session can be created. Nothing can be sold. |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Developers → Webhooks → signing secret | Webhook signature verification fails; paid orders are never recorded. |
| `STRIPE_PRICE_ID_STARTER_SETUP` | Stripe → Products, or the bootstrap route below | The Starter tier cannot be purchased. |
| `STRIPE_PRICE_ID_GROWTH_SETUP` / `_MONTHLY` | as above | The Growth tier cannot be purchased. |
| `STRIPE_PRICE_ID_COMPLETE_SETUP` / `_MONTHLY` | as above | The Complete tier cannot be purchased. |
| `STRIPE_PRICE_ID_COMMERCE_SETUP` / `_MONTHLY` | as above | The Commerce tier cannot be purchased. |
| `OPERATOR_DASHBOARD_PASSWORD` | `openssl rand -hex 32` | On a production build this is **fail-closed by design**: `/dashboard` answers 503 and every dashboard action plus `/api/stripe/bootstrap-prices` is denied. A placeholder (`changeme`, `password`, …) counts as unset. Do not weaken this. |
| `RESEND_API_KEY` | Resend dashboard → API keys | No outreach or digest email is sent. |
| `EMAIL_FROM` | A Resend-**verified** sender address | `sendEmail` refuses; an unverified sender is also a deliverability and CAN-SPAM problem. |
| `OPERATOR_DIGEST_EMAIL` | Owner's mailbox | The "Send daily digest" button has no recipient. Optional. |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Marketing packs fall back to a stub instead of generated content. Optional, and **billed** — leave unset until wanted. |
| `ALLOW_STRIPE_BOOTSTRAP` | `1`, temporarily | Only needed for the one-shot price creation below. Leave unset otherwise. |

`VERCEL_TOKEN`, `VERCEL_TEAM_ID` and `VERCEL_PROJECT_ID` are read by the domain
provisioning path. They are only needed if this venture provisions client
domains through Vercel; on this cluster it does not, and the dashboard shows a
readiness banner rather than failing.

## Order of operations for a first sale

1. Provision the Secret out of band with the Stripe and Resend keys above.
2. Set `ALLOW_STRIPE_BOOTSTRAP=1`, `POST /api/stripe/bootstrap-prices`, paste the
   returned `envSnippet` into the Secret as the seven `STRIPE_PRICE_ID_*` keys,
   then unset `ALLOW_STRIPE_BOOTSTRAP`.
3. Build an image passing at least `NEXT_PUBLIC_CONVEX_URL` and
   `NEXT_PUBLIC_APP_URL` as `--build-arg`. Without step 3 the first paid order is
   written to storage that does not survive a restart.
4. Add the `env:` block to `deployment.yaml` referencing
   `local-site-studio-secrets`, and delete this app's entry from
   `platform/k8s/deployment-env-coverage.yaml` — the suite fails until the entry
   is removed once a contract exists, and `max_registered` must be lowered with
   it.
5. Promote an image. Today `local-site-studio-image.yml` publishes an immutable
   `:sha` tag only and never pushes `:latest`, while `kustomization.yaml` pins
   `newTag: latest` — registered as IMG-011. Promotion is a deliberate owner
   step, not a side effect of merging.

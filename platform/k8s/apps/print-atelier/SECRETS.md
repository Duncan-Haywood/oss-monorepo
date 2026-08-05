# print-atelier secrets

`deployment.yaml` reads every credential from a Kubernetes Secret named
`print-atelier-secrets` in the `web-services` namespace. That Secret is
**provisioned out of band** and is deliberately not a manifest in this
directory and not listed in `kustomization.yaml` — the same arrangement
`quick-pick-survey` uses for `quick-pick-secrets`
(`ventures/quick-pick-survey/docs/DEPLOYMENT.md:48`: "Workload manifests
reference their keys and never contain plaintext values").

Nothing in this repository contains a value for any key below, and nothing
should. `platform/ci/test/print-atelier-deployment-env-contract.test.mjs` fails
the build if a literal `value:` appears in this Deployment's `env:` list, or if
a Secret manifest turns up under this directory.

## Why no defaults

This venture has already shipped the defect that a placeholder default causes.
`ventures/print-atelier/src/lib/fulfillment-order-inputs.ts` carried
`?? "123 Market St"`, which became the real delivery address on every paid
order. A credential default is the same failure with a larger blast radius: a
`sk_test_` fallback in production means charges silently do not settle, and a
fake Printful key means the print is queued to an array and never made.

So the required keys below have no `optional:` marker. A missing key leaves the
pod in `CreateContainerConfigError` and it never serves traffic. That is the
intended outcome.

## Required keys — the pod will not start without all nine

| Key | Where to get it | What breaks without it |
| --- | --- | --- |
| `PRINT_ATELIER_OPS_TOKEN` | `openssl rand -hex 32` | Every operator route answers 503. `src/lib/api-auth.ts` fails closed by design; the deploy is simply inert. |
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys | Checkout cannot create a session. |
| `STRIPE_PUBLISHABLE_KEY` | same page | Checkout readiness reports a blocker. |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Webhooks → signing secret, or `stripe listen` in test mode | `/api/stripe/webhook` returns 503 and no payment is ever recorded. |
| `STRIPE_CONNECT_CLIENT_ID` | Stripe → Connect settings → OAuth → client ID | Artist payout accounts cannot be attached. |
| `PRINTFUL_API_KEY` | Printful dashboard → Developers | See below. |
| `PRINTFUL_STORE_ID` | Printful store settings | See below. |
| `GELATO_API_KEY` | Gelato dashboard → API | See below. |
| `GELATO_STORE_ID` | Gelato store settings | See below. |

The four fulfillment keys are required rather than optional because of the
shape of `src/app/api/stripe/webhook/route.ts:111` and `:124`: the vendor
adapter is handed `fetch` **only** when that vendor's key pair is set, and
`undefined` otherwise. With Stripe configured and a vendor not, the charge
succeeds, the order is recorded, and the fulfillment submission goes to a
process-local array that nothing drains. Money in, nothing printed, no error
anywhere. Both vendors are required because both branches are reachable: the
handler routes to Gelato when `orderRecord.fulfillmentPartnerId === "gelato"`
and to Printful for everything else.

## Optional keys — absent means the feature refuses, not that it guesses

`META_PIXEL_ID`, `META_CATALOG_ID`, `META_ACCESS_TOKEN`,
`GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_ACCESS_TOKEN`,
`GOOGLE_ADS_CONVERSION_ACTION_ID`, `GOOGLE_ADS_DEVELOPER_TOKEN`,
`GOOGLE_MERCHANT_CENTER_ID`, `PINTEREST_AD_ACCOUNT_ID`,
`PINTEREST_ACCESS_TOKEN`, `STRIPE_AUTOMATIC_TAX`.

These are marked `optional: true`, so a key absent from the Secret leaves the
variable unset rather than blocking the rollout. That is what the application
already expects: `shouldFireRetargetingHttp`
(`src/app/api/stripe/checkout/route.ts:42`) does not fire, and
`executeAdCatalogSync` lists the missing keys as blockers and simulates rather
than pushing a catalog. No money and no customer-facing correctness turns on
them.

`STRIPE_AUTOMATIC_TAX` is the exception in that list and is optional for a
different reason. It is a feature flag, not a credential, and only the exact
string `enabled` turns it on (`src/lib/checkout.ts:352`). Off is the safe
default and is enforced by the parser rather than by a default value: enabling
Stripe Tax on an account without a tax registration and origin address makes
Stripe reject the session, which takes the entire checkout down. Set it only
once that registration exists. It is a genuine runtime read — the `/checkout`
server component calls `isAutomaticTaxEnabled(process.env)` and passes the
result to the client component that prints the order summary — so leaving it
out of the pod means the quoted total can stop describing the charged total.

This one was not in the original enumeration; the control test found it. It is
read as `env.STRIPE_AUTOMATIC_TAX` against a threaded `EnvSource`, so a scan
for `process.env.X` alone does not see it.

## Deliberately not in the Deployment

These are read by the venture but must not appear as container env, each for a
different reason. The control test holds this list and re-checks the reason.

- `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CONVEX_URL` —
  Next.js substitutes `NEXT_PUBLIC_*` at **build** time, so a runtime env entry
  would look like configuration and change nothing. Verified against this
  venture's own build output: `.next/server/app/sitemap.xml.body` contained the
  literal `printatelier.com` baked in from the `??` fallback in
  `src/app/sitemap.ts`. **Closed 2026-08-05, but not from here:** the `??`
  fallbacks are gone — `ventures/print-atelier/src/lib/site-url.ts` resolves the
  origin and returns null rather than a guessed domain — and
  `ventures/print-atelier/Dockerfile` now takes `NEXT_PUBLIC_SITE_URL` as a
  build arg with deliberately no default. So the origin is still not settable
  from this directory; it is set on the build, and an image built without it
  publishes nothing (robots.txt disallows all, sitemap.xml is empty,
  `/api/ad-catalog/sync` answers 503) instead of publishing someone else's
  domain.
- `NODE_ENV` — already set to `production` by the image
  (`ventures/print-atelier/Dockerfile`). Restating it here creates a second
  place to get it wrong.
- `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_ID` — Vercel platform
  variables read by `src/lib/partner-credentials.ts:234-237`. They are never set
  on this cluster and their absence is exactly how the code detects "not on
  Vercel".
- `CONVEX_URL` — its only consumer is
  `src/lib/convex-sync-status.ts`, where the configured/unconfigured branch is
  `isConvexConfigured ? "synced" : "synced"`. Setting it changes no behaviour.
  The control test asserts that no-op is still there, so if Convex is ever
  wired for real the exemption breaks rather than silently persisting.

## Creating the Secret

Run against the cluster, never committed:

```sh
kubectl -n web-services create secret generic print-atelier-secrets \
  --from-literal=PRINT_ATELIER_OPS_TOKEN="$(openssl rand -hex 32)" \
  --from-literal=STRIPE_SECRET_KEY=... \
  --from-literal=STRIPE_PUBLISHABLE_KEY=... \
  --from-literal=STRIPE_WEBHOOK_SECRET=... \
  --from-literal=STRIPE_CONNECT_CLIENT_ID=... \
  --from-literal=PRINTFUL_API_KEY=... \
  --from-literal=PRINTFUL_STORE_ID=... \
  --from-literal=GELATO_API_KEY=... \
  --from-literal=GELATO_STORE_ID=...
```

Add the optional keys with further `--from-literal` flags when those ad
accounts exist. ArgoCD syncs this directory with `prune: true`; because the
Secret is not a manifest here, it is not in ArgoCD's inventory and prune will
not remove it.

## Still open elsewhere

- The image `git.marisstella.dev/giteaadmin/print-atelier:latest` is pinned by
  tag, not digest, in `kustomization.yaml`. `local-site-studio` and
  `quick-pick-survey` both carry a `digest:`.
- `ventures/print-atelier/.env.example` does not declare `CONVEX_URL` or
  `NEXT_PUBLIC_CONVEX_URL`, although the source reads both. Neither is supplied
  to the pod, so the control does not currently bind on them.
- `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_CONVEX_URL` still have no build arg in
  `ventures/print-atelier/Dockerfile`. `NEXT_PUBLIC_SITE_URL` — the one that
  baked `https://printatelier.com` into every sitemap, robots.txt and ad-catalog
  feed — was fixed on 2026-08-05 and is listed above. The other two were not
  fixed in that change, and one of them is the same shape:
  `src/app/api/stripe/checkout/route.ts:58` reads
  `process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"` for the Stripe
  success and cancel URLs. It is reached only when the request carries no
  `Host` header, and the line above it trusts that header — which is its own
  finding, not this one.
- The build that produces the deployed image passes no
  `--build-arg NEXT_PUBLIC_SITE_URL`, so what
  `.gitea/workflows/print-atelier-image.yml` publishes today is a deployment
  that refuses to publish: robots.txt disallows crawling, sitemap.xml is empty,
  and `/api/ad-catalog/sync` answers 503. That is the intended fail-closed
  state, not a finished configuration — someone has to decide the origin this
  venture serves and pass it to the build.

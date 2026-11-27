# @seller-books/billing

Paddle billing for the monorepo's paid apps, extracted from `apps/grants`:

- **Port**: `BillingProvider` (`createCheckout`, `createPortalSession`, `parseWebhook`) and the
  normalized `BillingWebhookEvent`.
- **Paddle adapter**: `PaddleBillingProvider`. It uses plain `fetch` and WebCrypto, with no SDK. It
  verifies `Paddle-Signature` (HMAC-SHA256 over `ts:body`, 5-minute tolerance, any matching `h1`),
  takes the plan **only from the billed price id**, and selects the sandbox from the `pdl_sdbx_`
  key prefix.
- **Signed fake provider**: `SignedFakeBillingProvider`, for tests and offline demos. It verifies
  `x-fake-signature`, so your webhook route's rejection path gets tested too. `fakeWebhookRequest()`
  builds signed requests.
- **Checkout tokens**: `newCheckoutId`, `signCheckoutToken`, `parseCheckoutToken` and
  `resolveCheckoutToken`. A token is the only thing that goes into Paddle `custom_data`, and it binds
  a checkout to an org without naming the org.
- **Webhook rules**: `decideSubscriptionUpdate` decides between "customer mismatch",
  "out-of-order event", "stale subscription" and "unknown plan", and updates the ordering watermark
  and the past_due grace start.
- **Plans and entitlements**: `definePlanCatalog`, `resolveEntitlement`, `checkQuota`, plus
  anniversary-based monthly quota periods (`periodKeyFor`).
- **Grace**: a 7-day past_due grace from the first failed renewal (`pastDueGraceUntil`,
  `nextPastDueSince`). The length can be set per app.
- **Cost-plus pricing check**: `fullMonthlyCost` (variable + hosting + Paddle 5% + $0.50 + 3% refund
  reserve), `deriveLargestQuota` and `assertPricingBand`. Every paid plan must keep **at least a 40%
  margin** (price ≥ 1.67× its fully loaded cost at full allowance) for both monthly and annual
  billing; quotas are derived at 50% (2×) and 40–60% is a minimum goal (owner, 2026-11-24: "aim for min 40-60%
  margins in the products"; "the 40-60 isn't a limit for how high the margins go but a sort of minimal goal"). Higher is better; there is no ceiling. Constants: `MIN_MARGIN`, `QUOTA_MARGIN`,
  `TARGET_MARGIN`, `markupForMargin`.

It has no runtime dependencies. It runs on Cloudflare Workers, Node ≥ 22 and browsers (only the
pure modules). All functions are pure or take their I/O as arguments, so your app keeps ownership of
its database, routes and audit log.

```bash
cd packages/billing
pnpm test        # node --test (Node's built-in runner + type stripping), 52 tests
pnpm typecheck
```

The tests include a **parity fixture**. It rebuilds grants' cost model on these primitives and checks
that it reproduces the table in `apps/grants/docs/PRICING.md` exactly: $10 / $29 / $149 buying
1 / 5 / 31 drafts, markups 2.61/2.73, 2.17/2.06 and 2.19/2.02, and full costs of $3.83 / $13.36 / $67.99.

## Wiring it into an app

### 1. Depend on it

Pick one:

- **Workspace dependency (recommended).** Add `"@seller-books/billing": "workspace:*"` to the
  app's `dependencies`, then run `pnpm install`. This adds a lockfile importer entry, so your app's
  session makes that change.
- **No package.json change.** Add a path alias, e.g. tsconfig
  `"@billing/*": ["../../packages/billing/src/*"]` plus the matching Vite/Vitest `resolve.alias`.

The source is TypeScript that imports with `.ts` extensions. Vite, Vitest, Wrangler/esbuild and tsx
consume it directly. Your tsconfig needs `allowImportingTsExtensions` (the root
`tsconfig.base.json` already sets it) and `lib` must include `DOM` (for `Request` and `fetch`), or
you need `@cloudflare/workers-types`.

### 2. Define plans and the pricing test

```ts
// src/shared/plans.ts
import { annualPriceFor, definePlanCatalog, type BillablePlan } from "@seller-books/billing";

export interface Plan extends BillablePlan { name: string; quotes: number; seats: number }

export const catalog = definePlanCatalog<Plan>([
  { key: "comp", name: "Pilot", priceCents: 0, annualPriceCents: null, purchasable: false, quotes: 50, seats: 10 },
  { key: "starter", name: "Starter", priceCents: 900, annualPriceCents: annualPriceFor(900), purchasable: true, quotes: 20, seats: 2 },
]);
```

```ts
// plans.test.ts — fails CI when a model price or a prompt change breaks the 40% margin floor.
import { assertPricingBand, fullMonthlyCost, hostingMicros, llmCostMicros, tokens } from "@seller-books/billing";
import { catalog } from "./plans";

const perQuote = llmCostMicros(tokens(6_000, 1_500)); // measure your real pipeline
it("every paid plan keeps at least a 40% margin, monthly and annual", () => {
  assertPricingBand(catalog.plans, (plan, charge) =>
    fullMonthlyCost(
      { variableMicros: plan.quotes * perQuote, hostingMicros: hostingMicros(plan.quotes) },
      charge,
    ).totalMicros,
  );
});
```

Use `deriveLargestQuota(chargesFor(plan), (q, charge) => cost(q, charge))` to set each quota from its
price, the same way grants does with `TARGET_MARKUP` (2×, a 50% margin). That leaves headroom above
the 40% floor when model prices or prompts drift.

### 3. Pick the provider

```ts
import { createBillingProvider } from "@seller-books/billing";

const billing = createBillingProvider(env, { planKeys: catalog.purchasableKeys });
// FAKE_EXTERNALS=true / APP_ENV=test -> signed fake; BILLING_PROVIDER=paddle + key + webhook secret
// -> Paddle; otherwise null (answer 503 on checkout; comp plans keep working).
```

### 4. Checkout (admin-only route)

1. `const id = newCheckoutId()`. Insert a `pending_checkouts` row with
   `{ id, orgId: c.var.tenant.orgId, planKey, interval, expiresAt: now + CHECKOUT_TOKEN_TTL_MS }`.
2. `const token = await signCheckoutToken(CHECKOUT_SECRET, id, orgId)`.
3. `billing.createCheckout({ checkoutToken: token, planKey: checkoutPriceKey(planKey, interval),
   customerEmail, successUrl, cancelUrl, promoCode, providerCustomerId: existingRow?.providerCustomerId })`.
   A `PromoCodeError` should become a 400.

Never put an `orgId` or a `planKey` in `custom_data`. The token is the only binding.

### 5. Webhook route (`POST /api/billing/webhook`, unauthenticated)

```ts
let event;
try { event = await billing.parseWebhook(c.req.raw); }
catch (e) { if (e instanceof WebhookSignatureError) return c.json({ error: "bad signature" }, 401); throw e; }
```

Then follow the seven steps in `src/subscription-events.ts`:

1. Store `(provider, providerEventId)` once. If it was already processed, return `duplicate`.
2. Bind the org. Use the existing subscription row with this `providerSubscriptionId`. Otherwise load
   the pending checkout by `parseCheckoutToken(event.checkoutToken)?.checkoutId` and call
   `resolveCheckoutToken(secret, token, row, subId, now)`.
3. Call `decideSubscriptionUpdate(currentRow, event, { isPurchasable: catalog.isPurchasable, now })`.
4. Consume the token atomically (`UPDATE … WHERE id=? AND (consumed_at IS NULL OR provider_subscription_id=?)`).
   If no row was updated, ignore the event as `checkout token replay`.
5. Upsert the row with `decision.subscription`, `decision.providerUpdatedAt` and
   `decision.pastDueSince`. Audit a `customer mismatch`.
6. Always answer 200 with `applied`, `duplicate` or `ignored` plus the reason, so Paddle stops
   retrying.

### 6. Enforce

```ts
const ent = resolveEntitlement(row, { getPlan: catalog.get, now, compPlan: catalog.get("comp") ?? undefined,
  demoPlan: env.FAKE_EXTERNALS === "true" ? catalog.get("comp") : null });
if (!ent.active) throw paymentRequired(ent.blockedReason);
const q = checkQuota(ent.plan.quotes, usedThisPeriod /* SUM(usage) WHERE org AND period_key = ent.periodKey */);
```

Show a banner while `ent.graceUntil` is set (past_due, still inside the grace period).

### Tests in your app

Use `APP_ENV=test`, which selects the signed fake. Send webhooks with
`fakeWebhookRequest(url, { providerEventId, occurredAt, customData: { checkoutToken }, subscription })`.
Cover these cases: a bad signature returns 401; a duplicate event returns `duplicate`; a crafted
`customData.orgId` is ignored; a token replay by a second subscription is ignored; and a webhook
cannot touch another tenant's subscription.

## Secrets (owner-only)

Only the owner sets these, in the Cloudflare Worker secrets and/or GitHub environment secrets. Never
commit their values, and never let an agent set them.

| Name                     | What                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `BILLING_PROVIDER`       | `paddle`. Configuration, not a credential.                                                             |
| `BILLING_API_KEY`        | Paddle API key. A `pdl_sdbx_…` key uses the sandbox. Give it an expiry and least-privilege permissions. |
| `BILLING_WEBHOOK_SECRET` | The secret key of the Paddle notification destination.                                                 |
| `BILLING_PRICE_IDS`      | JSON `{"starter":"pri_…","starter:annual":"pri_…",…}`. Configuration, now read back from Paddle by the deploy (see "Products and prices as code"); a secret is only a fallback. |
| checkout-token secret    | Signs checkout tokens. Grants reuses `AUTH_SECRET`. Use your app's auth secret or a dedicated ≥ 32-byte random value. Checkout must fail without it, except in the offline demo. |

The Worker binding names above are what `createBillingProvider` reads. In GitHub, several apps share
the `production` and `demo` environments, so store each app's values under app-prefixed secret names
(for example `PAYAPPS_BILLING_API_KEY`). Map them to the binding names in that app's deploy workflow,
and add each name to `docs/security/secrets-inventory.yaml`.

If several apps share one Paddle account, each app's webhook destination also receives the other
apps' events. Those events are harmless: their price ids aren't in this app's `BILLING_PRICE_IDS`, so
they normalize without `subscription` and are ignored as `no subscription data`. Even so, give each
app its own notification destination and secret.

### Paddle setup (owner checklist)

1. Verify the Paddle account. The domain review needs a live pricing page, terms, a privacy policy
   and a refund policy.
2. ~~Create products and prices by hand.~~ Automated: see "Products and prices as code" below.
3. Set Checkout → Default payment link (a hosted-checkout launch URL).
4. Under Notifications, add a destination at `https://<app>/api/billing/webhook` for
   `subscription.*`, `transaction.completed` and `adjustment.*`. Its secret becomes
   `BILLING_WEBHOOK_SECRET`.
5. Create promo codes under Discounts (optional).

## Products and prices as code

Nobody creates products or prices in the Paddle dashboard (owner, 2026-11-24: minimal click ops).
Each app commits a catalog file generated from its plan list, e.g. `apps/grants/billing/paddle-catalog.json`
(a test in the app fails when the file is stale). The production deploy runs:

```bash
BILLING_API_KEY=… node packages/billing/scripts/paddle-catalog.ts \
  --catalog apps/grants/billing/paddle-catalog.json --apply --price-ids-out price-ids.json
```

and uses `price-ids.json` as the Worker's `BILLING_PRICE_IDS`. Without `--apply` it only reads Paddle and
prints the plan. The rules (`src/paddle-catalog.ts`):

- Identity is `custom_data` (`{app, plan}` on products, `{app, plan, interval}` on prices). Only items
  tagged with the catalog's `app` are read or changed; hand-made or other apps' items are never touched.
- Nothing is deleted. A changed amount creates a new price and archives the old one, so existing
  subscribers keep the price they bought at. Prices of a plan dropped from the catalog are archived.
- More than 4 archives in one run is refused, so a broken catalog file can't take every plan off sale.
- Prices are integer minor units (cents) in the catalog's currency, USD or EUR; the catalog is validated
  before any call.

### Is the key the right kind?

Before it touches the catalog, the script says what kind of key it was given and which catalog calls
that key may make (owner, 2026-11-27: "there is a key is it the right type or no?"). Every deploy that
syncs a catalog prints this, because they all run the script. Only the key's public prefix is printed.

```
PAYAPPS_BILLING_API_KEY: live (prefix pdl_live_apikey_)
  a live Paddle Billing API key: the right kind for charging real customers
  list-products: ok
  list-prices: ok
  create-product: 403 forbidden: give the key product.write
  create-price: 403 forbidden: give the key price.write
  missing permissions: product.write, price.write
```

| Kind | Shape | What to do |
| --- | --- | --- |
| live / sandbox | `pdl_live_apikey_…` / `pdl_sdbx_apikey_…` | Right kind. The catalog sync needs `product.read`, `price.read`, `product.write`, `price.write`. |
| legacy-format | no prefix | Works, but cannot carry permissions or an expiry, and says nothing about its environment, so the check tries live, then sandbox. Replace it with a new `pdl_` key. The runtime provider (`paddleBaseUrl`) treats an unprefixed key as live. |
| client-side token | `live_…` / `test_…` | Wrong kind: that is Paddle.js's token. |
| notification secret | `pdl_ntfset_…` | Wrong kind: that is `BILLING_WEBHOOK_SECRET`. |

Write permissions are probed by POSTing an empty body: Paddle refuses it before creating anything, with
400 when the key may write and 403 when it may not. That order (permission before validation) is an
assumption, not yet checked against a live account (this sandbox cannot reach api.paddle.com); if it were the other
way round, the check would say "ok" and the real create would still fail with its 403, which the sync
prints. To check a key by hand: `BILLING_API_KEY=… node packages/billing/scripts/paddle-key-check.ts
--label PAYAPPS_BILLING_API_KEY` (exit 0 all allowed, 1 a call refused, 2 unusable key).

To add an app: build its catalog with `catalogFromPlans`, commit the JSON with a staleness test like
`apps/grants/src/shared/billing/paddle-catalog.test.ts`, and add the same deploy step.

## Migration note: apps/grants

Grants keeps its own copy for now. Its session adopts this package later; nothing in `apps/grants`
changed here. The mapping is one to one:

| apps/grants                                                    | packages/billing                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `worker/ports/billing-provider.ts`                             | `provider.ts` (`ProviderSubscription` is now a named type)                     |
| `worker/ports/billing/crypto.ts`                               | `crypto.ts` (`PromoCodeError` also exposes `.code`)                            |
| `worker/ports/billing/checkout-token.ts`                       | `checkout-token.ts`, plus `newCheckoutId` and `CHECKOUT_TOKEN_TTL_MS`          |
| `worker/services/billing/checkout.ts` `resolveCheckoutToken`   | `resolveCheckoutToken(secret, token, row, subId, now)`. The DB lookup stays in grants |
| `worker/ports/billing/fake.ts`                                 | `fake.ts`. The constructor takes `string \| { secret, promoCodes }`            |
| `worker/ports/billing/paddle.ts`                               | `paddle.ts`. Pass `planKeys: PAID_PLAN_KEYS` to keep "comp"-priced ids unusable |
| `worker/ports/billing-providers.ts`                            | `factory.ts` (`createBillingProvider(env, { planKeys })`, `parsePriceIds`)     |
| `services/billing/webhooks.ts` `staleReason` + mismatch + grace | `subscription-events.ts` `decideSubscriptionUpdate`                            |
| `shared/billing/grace.ts`, `period.ts`                         | `grace.ts` (+ `nextPastDueSince`), `period.ts`                                 |
| `shared/billing/plans.ts` `checkoutPriceKey` / `parseCheckoutPriceKey` | `price-keys.ts`. Pass `PAID_PLAN_KEYS` as the allow-list                |
| `shared/billing/plans.ts` band constants, `annualPriceFor`, `deriveIncludedDrafts` | `pricing.ts` (`deriveLargestQuota`, `assertPricingBand`)    |
| `shared/billing/cost-model.ts` MoR fee, reserve, hosting, markup | `cost-model.ts`. Grants keeps its `STAGE_TOKENS` / application estimate      |
| `services/billing/index.ts` `getEntitlement` logic            | `entitlement.ts` `resolveEntitlement` (adds `blockedReason`)                   |

Suggested steps for the grants session:

1. Add the dependency or alias. Re-export from the old module paths first
   (`export * from "@seller-books/billing"`) so imports don't churn.
2. Replace the bodies, then delete the old files.
3. Keep `test/worker/billing*.test.ts` unchanged as the regression net. They must pass with no edits
   apart from imports.

Behaviour is identical, with one exception: `parseCheckoutPriceKey` now also rejects
`plan:annual:extra`. Signing a malformed checkout id now throws, but grants only signs ids it created
itself.

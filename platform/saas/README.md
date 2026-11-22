# platform/saas: shared accounts, billing and metering (planned)

**Status: not built yet.** This README sets the scope so that the first
sessions that build it, and every product that will use it, aim at the same
thing. The plan it comes from is
[`docs/reports/2026-11-22-freemium-saas-plan.md`](../../docs/reports/2026-11-22-freemium-saas-plan.md);
the rules it must meet are in [`prompts/goals.md`](../../prompts/goals.md)
("The business model", "Operating hosted services").

## What it is for

Maris Stella Labs LLC runs the portfolio as freemium SaaS (owner,
2026-11-22). Free tools keep working with no account. Pro adds depth across
every tool, and larger products (Grant Autopilot first) can carry their own
plans. This package is the one place that knows who a user is and what they
have paid for, so that no product builds its own sign-in or billing.

## What goes in it

Extracted from Grant Autopilot, which already runs each piece in production
code behind a small interface with a fake for tests:

| Piece | Grant Autopilot source (moving to `ventures/grant-autopilot/`) | Change for the portfolio |
|---|---|---|
| Sign-in and sessions | Better Auth (email and password, Google), Turnstile | A session cookie on `.marisstella.app` so static tool pages can see a signed-in user |
| Accounts | Organisations, members, roles, tenant middleware, cross-tenant tests | Add personal accounts beside organisations |
| Billing | `BillingProvider` port with the Paddle adapter (checkout, customer portal, signed webhooks, single-use checkout tokens) | One product catalogue: portfolio Pro plus per-product plans |
| Entitlements | Plans, quotas, billing periods, grace (`src/shared/billing/`) | `GET /entitlements`: a short-lived signed answer to "what may this user use", which pages and Workers check |
| Metering and cost caps | LLM port with per-call cost, the budget guard (monthly per account, global daily cap, `0` as a kill switch), `plans.test.ts` | Caps for every free and paid tier, and the build-failing cost-band test for each plan |
| Email | Resend adapter (address checks, header-injection protection, idempotency) | One verified sending domain |
| Privacy and legal | Export, deletion, retention, consents, audit log; versioned legal documents | One shared set of pages naming Maris Stella Labs LLC, plus the list of services that process user data |
| Security middleware | Security headers, Origin check, request limits, rate limiters | Unchanged |

## How a product uses it

1. The free path stays as it is: a static page, no account, no call to this
   service.
2. The product declares its Pro features (a name and a one-line description
   per feature) in its own code.
3. When a signed-in user reaches a Pro feature, the page or the product's
   Worker asks `GET /entitlements` and unlocks the feature only on a valid,
   unexpired, signed answer. Offline or malformed answers never unlock.
4. Anything that spends money per user (model calls, storage) goes through
   the metered clients here, never straight to a provider.

The dark paid paths built in November (`licence.mjs` and `checkout.mjs` in
wall-framing-takeoff, shed-designer, shift-roster-builder,
einvoice-preflight, league-schedule-generator, changepoint-detector and
quick-pick-survey) were written for a licence-key provider. Paddle has no
licence keys, so each one swaps its licence check for step 3 once this
service exists (`portfolio/monetization/models.yaml`).

## Where it runs and who can deploy it

The code lives here, in public, under FSL-1.1-MIT. The running service holds
user data and Paddle keys, so it deploys only from the protected production
lane: a separate Cloudflare account, a private operations repository, and a
GitHub environment with the owner as required reviewer. Paddle's API key,
webhook secret and price ids, and the Resend and Anthropic keys, live only
there, never in this repository, its Actions secrets or a session
(`docs/reports/2026-10-30-billing-plan.md`, Option B). Changes under this
directory are meant to need the owner's review (a CODEOWNERS entry, added in
its own small PR, since `.github/` is itself owner-reviewed).

## Definition of done for the first version

- Sign-in, personal accounts, Paddle checkout and webhooks, and
  `GET /entitlements` working against Paddle's sandbox.
- Cost caps enforced and tested for every plan, with the kill switch.
- Cross-account access tests on every route.
- Export and deletion of a user's data.
- One tool's dark paid path (wall-framing-takeoff's bid package) unlocked
  through it end to end in the sandbox, with the free path unchanged.

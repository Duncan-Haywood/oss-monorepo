---
kind: brief
date: 2026-11-21
topics: [money, privacy, hosting, routing, guardrails]
---
# The paid-SaaS pivot: what the next runs build

The owner, 2026-11-21, set an overall pivot: from free, open-source,
"we never collect your data" tools to **a portfolio of paid, hosted SaaS
products** at about cost plus 100%, each on its own subdomain with its own
marketing. The direction itself, quoted, is in `prompts/goals.md`, "The
2026-11-21 pivot". This note is for agents: the shared work every paid
product needs, in the order that unblocks the most, and the traps.

## Shared work, in order

Each item is one or two runs. None needs the owner until the step marked
**owner**.

1. **Accounts and entitlements, once, for every product.** A Cloudflare
   Worker plus D1 (the account already serves marisstella.app and
   `platform/edge/` already runs a Worker with a D1 schema) holding users,
   organisations, plans and an entitlement check any product calls. Sign-in by
   email magic link first. One module under `platform/`, not one per product:
   the fleet-parity trap (`portfolio/DIRECTION.md`).
2. **Checkout hookup.** Map the owner's merchant-of-record checkout link and
   its webhook to an entitlement. The design rules are
   `docs/reports/2026-10-30-billing-plan.md`, Option A: no merchant key or
   webhook secret in the repo or a session. If a webhook secret is needed, it
   is a Worker secret the **owner** sets in the dashboard.
3. **Cost meter and `COSTS.md`.** A per-product, per-customer record of what
   serving them costs (requests, storage, model tokens, SMS/voice minutes),
   and a `COSTS.md` template: the providers' published prices, fetched in the
   run, times expected use, times two, rounded to a plain price above a small
   nominal floor. The meter is what keeps "cost plus" honest after launch.
4. **Terms of service and privacy policy**, one set for the company
   (Maris Stella Labs LLC, Colorado), linked from every product. Draft from
   the law (`docs/legal/privacy-baseline.md`, Colorado Privacy Act, CAN-SPAM,
   state auto-renewal laws for subscriptions), not from another company's
   text. **Owner** approves before they go live.
5. **Subdomains as code.** One subdomain of marisstella.app per product
   line, with its own marketing page, routed by a file with an apply step
   (`goals.md`, "Direction: everything as code"); the main site links out to
   all of them.
6. **Copy sweep.** Pages that lead with "nothing is uploaded" or "no data
   collected" are rewritten when, and only when, their product changes
   behaviour or moves to paid, in the same PR. A page must never claim less
   collection than its code does, and "free" claims come off a page in the
   same PR that adds the price.

## Product order

1. **AI revenue department** (`portfolio/smb/suites.yaml`, first row,
   building on `ventures/sales-agent/`). Used for our own distribution too.
2. The rest of `portfolio/smb/suites.yaml`.
3. **Construction**, the ventures track's lead: the flagships
   `wall-framing-takeoff`, `ifc-quantity-takeoff`, `ids-model-check` and
   `xer-schedule-check` (`portfolio/flagships.yaml`) are pieces of "one tool
   for literally everything" a construction or development company does;
   permits and plan review are the obvious missing pieces.
4. Deep tech, hardware and research with a product in it
   (`research/CLAUDE.md`, "Research that can be monetised").

## Traps

- **Paid gates must not strand users.** Until the checkout link exists, a
  product runs as a labelled free early-access period with the planned price
  shown. Nothing waits on the owner.
- **The repository is still public and MIT** until the owner decides
  otherwise. The paid value is what a copy of the code doesn't give you: the
  hosted service, its data, its AI and support. Never put a customer's data,
  a key or a price-sensitive secret in the tree.
- **Outreach is drafted, not sent** (`portfolio/smb/README.md`, "Learning
  what they need"). A voice agent that calls people is outbound
  telemarketing: TCPA consent rules and state call-recording laws apply, and
  turning one on is the owner's decision.

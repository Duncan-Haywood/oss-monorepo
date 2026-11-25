---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): billing, the paid path shipped dark

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#101 (merged).

**Why bet #2 and not bet #1.** PayApps (bet #1) had eight sibling PRs merged in the hour before this
run (private PRs 91 to 100), and the 2026-11-25 records show runs losing finished work to siblings
who merged the same roadmap item first. Job Shop Quote's ROADMAP had two **launch** items untouched,
with no claim branch on either. Billing is the one that stands most directly between the product
and a paying shop, so this run claimed `claude/jobshop-billing` before writing any code and built it.

**What landed** (`apps/jobshop-quote/docs/BILLING.md` in the private repo):

- **Plans** match the pricing page in `apps/jobshop-site` exactly. A unit test fails when they drift.

  | Plan | Price | RFQs a month | Users |
  | --- | --- | --- | --- |
  | Early access | free | 40 | 3 |
  | Shop | $199 | 125 | 3 |
  | Shop Plus | $399 | 300 | 10 |

- **What counts as an RFQ:** one count, the first time the AI reads it (`rfqs.counted_at`).
  - The count is claimed in one SQL statement that succeeds only while the shop is under its
    allowance, so two reads at once cannot both take the last one.
  - A failed read gives the count back.
  - Past the allowance the shop can still paste RFQs, enter parts by hand, price and send quotes.
    Only the AI read waits for next month or an upgrade.
- **Seats** count members plus open invitations. Accepting an invitation is checked again, in case
  the plan changed after it was sent.
- **AI ceiling per plan** ($20 / $60 / $150 a month). It plugs into the budget guard's existing
  `orgCapMicros` hook.
- **The margin test is a worst case.** Each plan is charged its whole AI ceiling plus support,
  hosting, Paddle's fee and the refund reserve, and must still clear the 40% floor. RFQs much
  larger than the cost model assumes therefore cannot sell a plan at a loss. The app runs on Haiku,
  so typical cost sits far below the ceiling.
- **Paddle** checkout and portal on `packages/billing`, plus the signed webhook. Its protections
  are the same as payapps':
  - a checkout token that binds the shop, signed and single-use;
  - the plan comes only from the billed price;
  - a webhook never grants the complimentary plan;
  - another customer cannot take over a shop's subscription;
  - repeated events are ignored.

  `billing/paddle-catalog.json` is generated from the plans. A Billing page sits at
  `/app/:orgId/billing`.

**Verification.** The private CI has no runner (a job "failed" in 3 s with no log, as earlier runs
recorded), so every step of `jobshop-quote-ci.yml` was run locally:

- `biome ci`, typecheck and build: clean
- unit tests: 81/81
- worker tests: 57/57, including 19 new billing tests
- `drizzle-kit check` and `generate`: no migration drift

The offline demo was also driven with Playwright: sign up, create a shop, open Billing, click Choose
Shop, and the fake checkout returned to `?checkout=success`.

**For the next run on bet #2:**

- **ROADMAP item 3, the deploy pipeline,** is the last launch item. It should run
  `packages/billing/scripts/paddle-catalog.ts` the way `payapps-deploy.yml` does, and pass the
  price ids to the Worker as `BILLING_PRICE_IDS`.
- The site's "10 drawing pages per RFQ" cap is not enforced yet. The AI ceiling bounds the cost
  instead.
- **Before taking money,** read the real cost per RFQ from `llm_calls` on early-access shops. The
  site's docs/PRICING.md assumes ~$0.40 at Opus prices.
- **Price changes start in `apps/jobshop-site/src/shared/plans.ts`.** Copy them to the app's
  `src/shared/plans.ts`; the parity test enforces it.
- The owner's open question (per seat vs per RFQ volume) is answered for now with the site's per-shop
  RFQ allowance. ROADMAP "Open questions" asks the owner to say if per-seat pricing should replace it.

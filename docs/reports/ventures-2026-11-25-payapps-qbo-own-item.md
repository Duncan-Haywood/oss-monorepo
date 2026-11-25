---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): QuickBooks invoices billed with the company's own item

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#73 (merged).

**What landed.** This is the first item of "QuickBooks, part 3" in the payapps ROADMAP. An admin
now picks which of the company's own QuickBooks items (active Service or Non-inventory, posting to
an income account) the pay application's work lines are billed with. The list is read live from
QuickBooks. Before this, every company got a new "Contract Income" account and "Contract Billing"
item on its first send.

**Why a buyer cares.** QuickBooks sync is a Crew-plan ($179) feature, and the bookkeeper decides
whether it stays switched on. A tool that adds its own income account to their chart of accounts
gets switched off. With this change the income posts where their reports already look.
`retainage-in-quickbooks.html` in pay-app-guides already tells readers to bill work "with your
normal sales items", so the product now does what the free guide says.

**Choices to keep.**

- The item is checked again on every send (`getItem`). If it was deleted or made inactive, the
  send stops with a 409 that names it, and nothing is written. PayApps never falls back to the
  default on its own, because that would post income to an account nobody chose.
- The `Retainage` item is refused as the work item, because that work would land in Retainage
  Receivable.
- Item ids belong to one QuickBooks company. The connection upsert keeps the choice when the same
  realm reconnects and clears it when a different realm connects (a CASE on the old `realm_id`
  against `excluded.realm_id`).
- `packages/qbo-sync` gains `getItem` and `listSaleItems`. Two query behaviours are not yet checked
  against Intuit: that `Type IN (...)` is accepted, and that queries return active rows only. Both
  are listed in the package README under "Not yet verified".

**Verification.** The private CI has no runner, so the steps from `payapps-ci.yml` and
`qbo-sync-ci.yml` were run locally:

- biome: clean apart from one older warning in `billing.ts`
- typecheck: clean
- unit tests: 233/233, 2 new
- worker tests: 166/166, 7 new in `quickbooks-item.test.ts`
- build: ok
- drizzle drift check: no drift
- qbo-sync tests: 49/49, 3 new

There was no browser check. The picker is covered by a component test (its options, the PUT body,
and the warning for an inactive item).

**Next.** These are in the ROADMAP: an item per SOV line or per job, a payment for an application
marked paid in full with no check recorded, and sending a payment automatically when it is
recorded (opt-in).

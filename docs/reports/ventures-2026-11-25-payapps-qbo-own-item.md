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

## Update: payments sent to QuickBooks as soon as they are recorded (private PR 111)

Later the same day (Duncan-Haywood/private-monorepo#111), the second item of "QuickBooks, part 3".
An admin can turn on **Send each payment to QuickBooks as soon as it is recorded** on the
QuickBooks page (`PUT /api/orgs/:orgId/quickbooks/auto-payments`, `qbo_connections.auto_send_payments`,
migration 0030, off by default). Each payment recorded on an application whose invoice is already in
QuickBooks then goes straight through the existing `sendPayment`.

**Why it matters to a buyer.** QuickBooks sync is the integration subs ask for first (bets.md, #1
risks). Before this, every check meant two clicks on two screens, and a forgotten one left
QuickBooks' A/R wrong. With it on, recording the check is the whole job.

**Choices the next run should keep.**

- One send path: the automatic send calls `sendPayment`, so the open-balance check (no double
  counting a check the bookkeeper entered by hand), the realm check, the plan gate and the
  `requestid` idempotency key all apply unchanged.
- Recording never waits on QuickBooks: the payment is saved first; a refusal comes back as
  `quickbooksAuto: {sent: false, message}` and shows under the payment form, and the payment waits
  in the panel to be sent or marked. Only `AppError` messages reach the page.
- Off by default and per company; a disconnect deletes the connection row, so it starts off again.

**Next.** Re-send a refused payment from the cash report; an item per SOV line or per job.

**Duplicate-work note.** This run first built "weekly email in the member's own time zone and hour"
(private PR 107) and closed it unmerged: three runs built the same roadmap line within minutes
(PRs 106, 107, 108; 106 merged). Check the private repo's open *and just-merged* PRs right before
starting a roadmap item, not only at the start of the run.

## Update: payments not yet in QuickBooks, on the cash report (private PR 112)

Later the same day (Duncan-Haywood/private-monorepo#112), ROADMAP "QuickBooks, part 4", second half.
The Cash and retainage page has a **Not yet in QuickBooks** card. It lists every payment recorded on
an application whose invoice is already in QuickBooks but that is not itself there yet, oldest
first across jobs (`GET /api/orgs/:orgId/quickbooks/unsent-payments`, `unsentPayments`; no migration).
Editors can **Send to QuickBooks** or mark **Already in QuickBooks** from the row.

**Why it matters to a buyer.** With automatic sending on (PR 111), a refused send only showed
once, under the payment form, and after that sat unseen on one pay application. QuickBooks then
showed that invoice as more unpaid than it was, which is the A/R error the sync is sold to prevent.
The cash report is the page a contractor opens weekly, so a refusal can no longer be forgotten.

**Choices to keep.**

- No second send path. The row buttons call the pay application's existing
  `POST .../payments/:paymentId/quickbooks`, so every check (open balance, realm, plan, requestid)
  runs again and a refusal shows its reason.
- "Not there yet" means no `qbo_payment_syncs` row, joined within the org on every table. The sample
  job is left out. A row whose invoice is in another company is flagged and has no buttons.
- The list is read live, not stored. It is a separate card and endpoint, so the pure
  `cashReport()` and the weekly email are unchanged.

**Verification** (local; private CI has no runner): biome clean (one older warning), typecheck
clean, unit 393/393 (4 new), worker 231/231 (3 new, including cross-tenant), build ok, no schema change.
No browser run. The card is rendered through the router in its component test.

**Next.** An item per SOV line or per job. The weekly email could name the count of payments not
yet in QuickBooks; that would need `cash-digest.ts` to take the list as input.

## Update: balances closed short sent to QuickBooks as credit memos (private PR 115)

Later the same day (Duncan-Haywood/private-monorepo#115), ROADMAP "Cash report, part 4". Once a
balance is closed short as a **backcharge** or **written off**, the pay-app's QuickBooks panel offers
**Send credit memo to QuickBooks**. It creates a `CreditMemo` numbered `CM<job>-<nn>`, with one line
for exactly the closed balance on the invoice's work item, dated the day the balance was closed. It
then applies the memo to the invoice with a zero-total `Payment` that links both, so the invoice
closes in QuickBooks too (`POST .../pay-apps/:id/quickbooks/credit-memo`, `qbo_credit_memo_syncs`,
migration 0032).

**Why it matters to a buyer.** Before this, closing a backcharge in PayApps left the same money open
on the invoice in QuickBooks until the bookkeeper wrote a credit memo by hand. QuickBooks' A/R then
overstated what the GC owed, which is the mismatch the Crew-plan sync is sold to remove.

**Choices to keep.**

- A disputed balance is never sent, because the contractor still claims it.
- Every payment on the application must be in QuickBooks first. The invoice's open balance is
  checked before anything is written, the same check `sendPayment` uses, and that check now
  subtracts a sent credit too.
- QuickBooks' "Automatically apply credits" setting can put a new memo on the GC's *oldest* open
  invoice, which may belong to another job. After creating the memo, PayApps reads its
  `remainingCredit` and the invoice balance. If the credit landed elsewhere it returns 409
  `quickbooks_credit_elsewhere`, records nothing, and the bookkeeper moves the credit and marks it
  by hand. The fake models this with `autoApplyCredits`.
- Reopening the balance, or deleting a payment, which also reopens it, asks first (409
  `credit_memo_in_quickbooks`). PayApps never voids anything in QuickBooks.
- `packages/qbo-sync` field names come from Intuit's `Finance.xsd`. The apply-by-zero-payment
  pattern is listed under "Not yet verified" for the first sandbox run.

**Verification** (run locally): typecheck clean, unit 399/399, worker suite green (7 new in
`quickbooks-credit-memo.test.ts`, including cross-tenant), build ok, qbo-sync 58 tests (9 new),
no schema drift. There was no browser run.

**Duplicate-work note.** PR 113 (an item per job) merged while this was being built and took
migration 0031. Rebasing onto it meant regenerating the migration as 0032, and calling `workItem`
with the job, so the credit memo uses the job's own item. Fetch `origin/main` and check
`apps/payapps/migrations/` right before pushing.

**Next.** List closed-short balances that are not yet in QuickBooks beside the unsent payments on
the cash report (ROADMAP "Cash report, part 5").

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

## Update: an item per job (private PR 113)

Later the same day (Duncan-Haywood/private-monorepo#113), the per-job half of "QuickBooks, part 4".
Below the company's item on the QuickBooks page, admins see every job on "The company's item" and
can give one its own item (`PUT /api/orgs/:orgId/quickbooks/job-items/:projectId`, the list comes
back as `jobs` on `GET .../quickbooks/items`; `projects.qbo_item_*`, migration 0031).

**Why it matters to a buyer.** An electrical sub that does service calls and new construction, or
tenant improvements and ground-up work, books them to different income accounts. With one item
per company, every invoice landed in one account and the bookkeeper reclassified by hand, or the
sub kept typing those jobs into QuickBooks themselves.

**Choices the next run should keep.**

- One validation path: the company's and the job's item both go through `checkSaleItem` (active
  Service or Non-inventory, income account, not `Retainage`).
- The job's item wins at send time and is read again; inactive, it stops that job's sends only
  (409 naming the job), never falling back to the company's item on its own.
- The choice stores the realm it was made in (`qbo_item_realm_id`), so a different company ignores
  it without a clearing step, and reconnecting the same company brings it back.

**Next.** An item per schedule-of-values line (ROADMAP "QuickBooks, part 5").

**Verification.** Local (private Actions has no runners): typecheck clean, unit 395 passed, worker
238 passed (new `quickbooks-job-item.test.ts`, 7, with a cross-tenant case), build ok, biome clean.

## Duplicate-work note: credit memos built twice (private PRs 114 and 115)

Two runs built ROADMAP "Cash report, part 4" (a balance closed short sent to QuickBooks as a credit
memo) in parallel, in the same hour, with nearly the same design. PR 114 merged first and PR 115
was closed unmerged, so read PR 114's agent doc for the feature itself. Both runs ran into PR 113
(an item per job) taking migration 0031, and both renumbered to 0032.

What would have caught it: at the start, neither run had an open PR on the private repo, and
"Cash report, part 4" was still in the ROADMAP's Next list. **Open the draft PR on the private repo
right after the first commit, with the ROADMAP line in its title**, so a parallel run's open-PR check
sees the claim. Before merging, fetch `origin/main` again: PR 115 found PR 114 only because its
merge was refused with "merge conflicts".

## Update: a balance closed short sent to QuickBooks as a credit memo (private PR 114)

Later the same day (Duncan-Haywood/private-monorepo#114), ROADMAP "Cash report, part 4". On the pay
application's QuickBooks panel, an editor can now send a balance closed short (a backcharge, a
dispute or a write-off) as **one credit memo to the GC, applied to that application's invoice**
(`POST .../pay-apps/:id/quickbooks/short-credit`, `?already=1` to mark one entered by hand;
`sendShortCredit`, the pure planner `src/shared/qbo-credit.ts`, table `qbo_credit_memo_syncs`,
migration 0032). `packages/qbo-sync` gained `createCreditMemo`, `getCreditMemo`,
`findCreditMemoByDocNumber` and `applyCreditMemo`.

**Why it matters to a buyer.** Before this, a backcharged pay app was closed in PayApps but stayed
open in QuickBooks, so the two A/R agings disagreed on every short-paid job until the bookkeeper
keyed a credit memo by hand. Short pays and backcharges are routine for subs, so this was the last
place the sync left the books wrong.

**Choices to keep.**

- Strict figures, no guessing. The send needs every payment on the application in QuickBooks
  first. The invoice's open balance must equal its total less those payments, and the credit is
  exactly that balance: the amount closed short, plus a second line when the GC certified below
  line 8. Anything else returns 409 `quickbooks_balance_mismatch` and sends nothing.
- Read back, don't assume. A company with "Automatically apply credits" on may apply a new memo by
  itself, possibly to an older invoice. PayApps reads the invoice after creating the memo. If the
  credit landed there, PayApps uses that. If it is still unapplied, PayApps applies it with a zero
  payment linking both. If it went to another invoice, the row records `applied: false` and the
  panel says to move it.
- Idempotent. The number is `CR` + the invoice number's tail, and `requestid` keys come from the
  org and application ids, so a retry records an existing memo instead of creating a second one.
- Nothing is voided in QuickBooks. Reopening the balance, or deleting a payment on a closed-short
  application, asks first (409 `credit_in_quickbooks`), like deleting a payment that is in
  QuickBooks. `sendPayment`'s balance check now subtracts an applied credit.
- The memo posts to the job's work item (the job's own item, else the company's, else
  `Contract Billing`; PR 113 merged in between), so the income is reduced where it was booked.

**Not yet verified.** The `CreditMemo` wire shape and the zero-payment application follow the PHP
SDK schema and Intuit community guidance. Neither has run against a sandbox company. Both are listed
in the package README under "Not yet verified".

**Verification** (local; private CI has no runner): biome clean (one older warning), typecheck
clean, unit 401/401 (5 new), worker 246/246 (8 new, cross-tenant included), qbo-sync 57/57 (6 new),
payapps-site unit 21/21, build ok, drizzle in sync after rebasing onto PR 113.

**Next.** An item per SOV line (the per-job item landed in PR 113). Record the QuickBooks responses
from a sandbox company as fixtures once the owner's Intuit app exists.

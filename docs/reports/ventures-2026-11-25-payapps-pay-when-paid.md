---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1) counts pay-when-paid terms from the owner's payment, and never guesses it

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#90 (merged). It is "Cash report, part 4" on the
PayApps roadmap.

**Why this slice.** Pay-when-paid is the common payment clause in subcontracts. It reads something
like "within 7 days after Contractor receives payment from Owner". Until now PayApps could count a
job's terms only from the application date or the period end. Its own help text told pay-when-paid
subs to "enter the days you usually wait". That made the due dates, the past-due total, the 30-day
forecast, the follow-up drafts and the QuickBooks due date guesses on exactly the jobs where cash is
hardest to predict.

**What landed.**

- **A third pay-terms basis, "after the owner pays the GC (pay-when-paid)".** It sits beside the
  existing two on the job page and the new-job form (`projects.pay_terms_basis` = `owner_paid`; the
  column is plain text, so it needed no migration).
- **The owner's payment date on each sent application.** It is stored in `pay_apps.owner_paid_on`
  (migration 0025) and set through `PUT .../pay-apps/:id/owner-paid` (editors only; `null` clears
  it). The request is refused on a draft, on a job with other terms, for a date in the future, and
  for a date before the billed period began. Each date recorded or cleared adds a history row.
- **No date, no due date.** Without the owner's date, `payDueOn` returns null. The money appears
  under "waiting on the owner's payment" in four places: a note on the cash page, the job row, a CSV
  column and a line in the weekly email. It is left out of past due and the forecast. After 30 days,
  a next step and a new "owner" follow-up draft ask the GC whether the owner has paid for that
  period, and on what date. Once the date is recorded, every figure counts from it.
- **No legal view.** The panel and the drafts take no position on whether a pay-when-paid or
  pay-if-paid clause can be enforced. The panel says PayApps only counts days.
- **QuickBooks.** An invoice sent before the owner's date is known has no due date. Recording the
  date later does not change the invoice already in QuickBooks. `docs/QUICKBOOKS.md` says so.
- **Public side.** The `pay-if-paid-clauses.html` early-access paragraph now describes the feature.
  The product is still described as in development.

**Verification** was run locally after merging main (see the run record's notes): typecheck,
unit tests 309/309, worker tests 205/205
(the new `test/worker/pay-when-paid.test.ts` covers the round trip, the refusals, viewer 403 and
cross-tenant 404), the build, and `biome ci`. A parallel run also took migration number 0024
(digest weekday), so this one was regenerated as 0025.

**Next** (PayApps ROADMAP, "Cash report, part 4"):
- Enter one owner-payment date for several applications at once.
- Add the outer limit many clauses carry ("in any event within 90 days"), after which the
  application is due anyway.
- Send a backcharge closed short to QuickBooks as a credit memo.

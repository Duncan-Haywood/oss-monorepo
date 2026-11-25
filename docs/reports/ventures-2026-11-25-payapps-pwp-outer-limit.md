---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): pay-when-paid outer limit

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#95 (merged).

**What landed.** This is "pay-when-paid, part 2" from the payapps ROADMAP. Part 1 (private PR 90) let
a job's pay terms count from the day the owner pays the GC. Until that day was recorded on an
application, the application had no due date. Many pay-when-paid clauses add "and in any event
within 90 days". A pay-when-paid job now takes that outer limit, in days from the application date
(`projects.pay_terms_outer_days`, migration 0026). An application is due on the earlier of two
dates: the owner's payment plus the days, or the application date plus the limit. While the owner's
payment is unrecorded, it is due on the limit date alone.

**Why a buyer cares.** On a pay-when-paid job, the money the subcontractor is owed under the outer
limit is the money most likely to be forgotten. GCs often never say when the owner paid. Before this
change, that money stayed in "waiting on the owner" forever and never showed as past due. Now it
counts in past due and in the 30-day forecast, and it is chased like any late application once the
outer date passes.

**Choices to keep.**

- `payDueOn(terms, basis, app, outerDays)` is still the only place that makes a due date. The cash
  report, the next steps, the drafts, the pay-app owner panel and the QuickBooks invoice all call it.
- The outer limit counts from the application date. That is how the clauses we model read
  ("within N days of submission of the payment application"). If a clause counts from something
  else, it needs a new basis, not a different reading of this one.
- `awaitingOwner` now means "no due date". An application dated by the outer limit is not awaiting,
  so the totals never count the same money twice. `ownerPaymentUnknown()` drives the "has the owner
  paid?" step and draft. That step still runs until the application is past due, because an earlier
  owner payment would make it due sooner. The step and the draft name the outer date.
- The limit is ignored under the other bases. The editor sends null when the basis changes away from
  pay-when-paid.
- PayApps still states no view on whether a pay-when-paid clause or its outer limit is enforceable.

**Verification.** The steps in `payapps-ci.yml` were run locally, with green results: worker 215/215, the site unit tests 21/21,
typecheck, biome ci (one pre-existing warning in an untouched file), the full unit suite, the worker
suite, the build and the migration drift check.

**Next.** Pay-when-paid part 3: one owner-payment date entered for several applications at once.

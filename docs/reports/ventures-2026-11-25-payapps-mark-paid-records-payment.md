---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): "Mark paid in full" records the payment, so it reaches QuickBooks

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#88 (merged).

**What landed.** "Mark paid in full" now asks for the date the money came in and the check
number, and records the balance still owed as one payment. That payment turns the application
paid by the same rule as any other payment. Leaving the date blank keeps the old behaviour: the
application is marked paid and no payment is recorded. An application already marked paid with no
payment behind some or all of the money shows that amount (`unrecordedCents` on the pay-app DTO),
and the payments panel offers to record it as one payment later (`POST .../payments/unrecorded`).
The server works out the amount, so it cannot be mistyped, and it never counts a balance closed
short.

**Why it matters to a buyer.** Most subs get paid in full and click the one-button path. Before
this, that path left nothing to send to QuickBooks: the invoice stayed open in the books while
PayApps called it paid, so the sync broke on the most common case. The bookkeeper also had no
check number or date in the history. This closes the ROADMAP item "QuickBooks part 3: a payment
for an application marked paid in full with no check recorded".

**Design choices the next run should keep.**

- One path for money in: the mark-paid route calls the existing `recordPayment`, so the
  payment rules, status change, cash report and QuickBooks balance check all stay in one place.
- The old body-less `POST .../mark-paid` still works (older clients, existing tests), and it still
  writes a `marked_paid` history row. With a date, the history shows the payment instead.
- A payment recorded later on an app that was already paid writes its history row without
  "now paid in full", because it did not change the status.

**Duplicate work, for the scheduler.** This run first built change order attachments. A parallel
session pushed the same feature to the same branch name two minutes earlier, and it landed as
private PR #86. This run dropped its copy unpushed and switched to this item. Before building a
ROADMAP "Next" item, check `git ls-remote origin` for a branch with the item's slug as well as
the open PRs: a pushed branch can exist before its PR does.

**Verification.** Local; private Actions has no runners. `pnpm typecheck` clean. After rebasing
onto #86: unit 284 passed, worker 200 passed. `pnpm build` OK before the rebase. New tests:
`test/worker/mark-paid-payment.test.ts` (6), `test/unit/unrecorded-payment.test.tsx` (2), and
cases in `src/shared/payments.test.ts`.

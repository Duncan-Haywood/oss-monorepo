---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): the last change order follow-up in the cash report and weekly email

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#103.

**What landed.** This is the roadmap item "Change orders, part 6". Part 5
recorded the day a pending change order's email draft was copied or opened
(`change_orders.last_emailed_on`), but only the job page showed it. Now:

- The cash report's next step for a pending change order over 30 days names the last follow-up
  emailed from PayApps after the date sent: "Last follow-up emailed from here on 2026-11-20 (5 days
  ago)". The weekly "money to chase" email reuses the report's sentences, so Monday's email says
  the same thing.
- A request that was drafted with no date sent recorded asks the contractor to record the date
  sent. Without it, the change order is aged from the day it was entered, which understates the
  wait.
- An email on or before the date sent was the request itself, so nothing is added (the same rule
  as `lastChase` in the email drafts).
- The cash page's pending table shows "last emailed" under the wait column, and the CSV's pending
  column appends it.

**Why a buyer cares.** The weekly list nags about every change order over 30 days. Before this
change, a PM chased on Friday showed up on Monday as if nobody had done anything, which teaches
people to ignore the list.

**Design choices to keep.** The wording is "emailed from here", not "sent". PayApps records a draft
being opened, not delivered. The change is pure and computed on read (`lastFollowUp` in
`src/shared/cash-report.ts`), with no migration.

**Verification.** Run locally in the private clone: `pnpm typecheck`; `pnpm test:unit` (38 files,
354 tests); `pnpm test:worker`, including a new case in `change-order-emailed.test.ts` that checks
the report JSON, the next step and the CSV against the stored date; and `biome check` on the
touched files.

**Next.** From the roadmap: weekly email part 3 (a link from each line to its own draft), and
pay-when-paid part 3 (one owner-payment date for several applications).

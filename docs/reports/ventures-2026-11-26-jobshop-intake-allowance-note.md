---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote: the 100% allowance note on the New RFQ form (2026-11-26)

This is bet #2 (`portfolio/monetization/bets.md`). The work is private-monorepo PR #227, merged (branch
`jobshop-quote/billing-part-4-intake-note`, claim
`claim/jobshop-quote/billing-part-4-the-rfq-page-s-80`). It is ROADMAP item 4, "Billing, part 4".

## Why this item
The private clone worked on the first try. Bet #1 (payapps) is busy: its Lien-waiver parts were
claimed minutes before this run, and its other free Next items either need a new dependency
(in-browser OCR, a HEIC decoder) or wait on "once a customer asks". On jobshop-quote, item 4 was
free and small, and it sits on the paid path. A shop that runs out of AI reads should be told so
where it is typing, not only by a banner it may scroll past. That is the point where a shop
decides whether to upgrade.

## What landed
- `intakeNote(billing, admin)` in `src/shared/allowance.ts` returns null below 100% and on plans
  with no allowance. At 100% it says the RFQ will be saved but not read by the AI, that its parts
  can be entered by hand, and when the allowance resets (UTC).
- Its action line comes from `allowanceBanner`, so the note and the banner always use the same
  wording. Neither one offers an upgrade while checkout is dark, and neither states a price.
- The New RFQ form shows the note above the submit button. At 100% the button reads "Create RFQ
  (enter parts by hand)" instead of "Create and extract".
- The form is not blocked, and the extract is still attempted. A stale cached summary must not
  stop a read that still has room, and a read without room answers 402 and counts nothing
  (`claimRfqRead`). Enforcement stays server-side.
- Creating an RFQ now refreshes the `billing` query, so the banner and the note update after the
  read that used the last slot.

## Next
ROADMAP item 4 now reads: a per-RFQ "this package needs N reads and M are left" warning before
submit, once drawing pages are counted in the browser.

## Verification
`pnpm typecheck` was clean, `src/shared/allowance.test.ts` passed 9/9 (4 new tests), and
`run_workflow_locally.py --repo-root /home/user/private-monorepo jobshop-quote-ci` passed all
11 of its run: steps, including the workerd integration tests and the Playwright e2e. The
remote jobs ended red in 2-3 s, which is runner starvation. The page was not checked in a browser, because no UI test seeds a shop at 100%.
The note's text and the branch that shows it are covered by the unit tests.

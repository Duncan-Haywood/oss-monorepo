---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote (bet #2): a job traveler from the won quote

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#357 (merged). The claim
`claim/jobshop-quote/job-traveler` was opened with `--slug`, because `roadmap_claim.py --bets` found
no free, ungated item on any bet. PayApps had three or more claims less than 15 minutes old, one of
them (tm-tickets) taken while this run was reading.

**Why this item.** It is the step after "won". The previous run (customer links, private PR 356)
listed "the accepted order as a job traveler" as its next step. A shop that wins a quote retypes the
same routing onto a traveler. That makes the quoting tool part of the job, not only the bid, which
is what keeps a shop paying for it after the RFQ rush.

**What landed.**

- `src/shared/traveler.ts` (pure):
  - `travelerLine` (starts via `startsFor`, stock pieces, operations 10/20/30, finishing, notes);
  - `planQuantities` (the shop's typed quantity, then the customer's accepted break, then the only
    break; parts not ordered online are left off);
  - `mergeNames` (the line's snapshot first, then today's rate card).
- `services/quotes/traveler-pdf.ts` (the own-PDF writer, no prices).
- `services/quotes/traveler.ts`: `GET /quotes/:id/traveler.pdf?due=&qty.<lineId>=`. It returns 409
  unless the quote is won, 400 with the part number when a quantity is missing, 400 for a bad
  date, quantity or line, and 404 across shops. Viewers may print.
- A "Job traveler" card on a won quote's page.
- No migration.

**Choices the next run should keep.**

- No price, rate or markup on the traveler. The worker test asserts that no `$` amount appears.
- Never guess a quantity or a time: a blank cycle prints "not set" and the total is left out.
- The traveler reads `quote_responses.choices`, so it stays correct if the outcome is later
  corrected by hand (the row is the buyer's record).

**Verified.** On the tree merged with main: unit 542 (12 new), the worker suite (4 new) and Playwright e2e
pass, along with the other `jobshop-quote-ci` steps (11 of 11 run locally; CI runners were starved). A 2-part, 30-operation
traveler was rendered to PNG and checked by eye, including the continuation page.

**Next, if shops ask.**

- A saved job (work order) with its own number and status.
- Barcodes per operation for floor time against the estimate.

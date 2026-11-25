---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): "Changes from Q-1001" on the customer PDF, and compare with any revision

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#147 (merged; private CI failed in 3 s with no logs, as on recent PRs, so local checks were the gate: unit 181/181, worker 105/105, typecheck, build, biome), claim
`claim/jobshop-quote/quote-revisions-part-3`.

**Why this item.** PayApps (bet #1) had six parallel claims in the last three hours and its free
Next items are either "once a customer asks" or proprietary GC-portal formats we cannot document
from a public source. Jobshop-quote item 7 part 3 followed straight on from private PR 141 (the
estimator's "what changed" view) and is customer-visible value: a buyer receiving Rev 2 sees what
moved without comparing PDFs.

**What landed.**
- `src/shared/quote-change-summary.ts`: `customerChangeSummary(QuoteChanges)` turns the pure diff
  into bullet lines. It reads only part number, part revision, description, quantity breaks with
  unit prices and lead time: the fields the PDF already prints. Operations, machines, minutes,
  material, blank, finishing and extras are cost basis (ARCHITECTURE rule 7) and are never read,
  so a change to those alone prints nothing.
- `quotes.show_changes_on_pdf` (migration 0008, off by default), settable by PATCH on drafts only.
  `quotePdf` and `sendQuote` add the section against `supersedesQuoteId` (the revision the PDF
  says it "Replaces"), so the stored, checksummed sent PDF carries it.
- `GET /quotes/:id/revisions` (oldest first, org-scoped) feeds a "Compare with" picker on the
  revision card once there are two or more earlier revisions. The card previews the exact PDF
  lines next to the checkbox.

**Keep.**
- The "never shows cost basis" unit test and the worker test that greps the rendered PDF for
  machine, minute and finishing names. If someone widens `CUSTOMER_LINE_FIELDS`, those fail first.
- PDF text is WinAnsi: the summary uses "to", not an arrow, so nothing prints as "?".
- Migration number 0008: renumber before merging if another jobshop PR lands one first.

**Next:** item 7 part 4: an email to the estimator the day before a sent quote expires (with item
6), and the "Changes from" line in the quote email body.

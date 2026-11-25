---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): repeat parts part 4, stale label and other-revision note

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#180.
Claim slug `repeat-parts-part-4` (ROADMAP item 9).

**Why this item.** Bet #1 (payapps) had 19 live claims in the last 6 h and its free items were
either conditional ("once a customer asks", "once usage is measured") or need format sources a
cloud session can't verify (GC portal CSVs). Bet #2's item 9 had two concrete, unclaimed parts
and needed no migration.

**What landed.**

- `prefillLabelStale(before, after)` in `src/shared/repeat-parts.ts`: true when the part number
  key or the revision (by `revisionMatchesForPrefill`) changes. `updateLine` drops
  `prefilled_from` then, unless the same save pre-fills anew. `updateLine` takes a fourth
  `opts.dropPrefillLabel`; `copyLineFrom` sets it when the copied line isn't the label's source.
- `wonAtOtherRevision(line, history)`: newest won item at another revision when none was won at
  this one; null for a pre-filled line. Drives an amber note in `PartHistory` (quote-detail.tsx).
- `PartHistoryItemDto.rfqId` and `.rfqFiles` (org-scoped `rfq_files` query over ≤10 RFQ ids).
  Links use the existing `/rfqs/:id/files/:fileId/download` route.

**Choices the next run should keep.** Inputs are never cleared with the label (the estimator
decides). A no-revision line against a won line with a revision counts as different, matching
the pre-fill rule.

**Next.** A side-by-side drawing viewer only if opening two tabs proves a chore; learning from
routing-suggestion picks; material family matching (rest of item 9).

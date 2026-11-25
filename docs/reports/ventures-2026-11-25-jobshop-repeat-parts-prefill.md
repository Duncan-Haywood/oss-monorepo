---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): repeat parts, part 2 (RFQ history + pre-fill from the last won quote)

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#157 (merged).

**Why this item.** PayApps (bet #1) had every free ROADMAP item either gated ("once a customer
asks", "once usage is measured"), claimed in parts by other runs, or needing GC-portal formats
(Textura, GCPay) that are not publicly documented. Bet #2's item 9 second half was free:
claimed with `roadmap_claim.py jobshop-quote --claim 9 --slug repeat-parts-part-2`.

**What landed.**

- `GET /rfqs/:id/part-history` (viewers too): each RFQ part's earlier quotes before a quote
  exists, reusing part 1's history query (refactored into `historyForPart`).
- `shop_settings.prefill_repeat_parts` (off by default; admin-only through `PATCH /settings`).
  When on, `createQuote` takes each RFQ part's last won line of the same part number and
  revision (`pickPrefillSource`, pure, in `src/shared/repeat-parts.ts`), copies its inputs with the
  RFQ's quantities and prices them from today's card. CAD suggestions are skipped for that line.
- `quote_lines.prefilled_from` (JSON label: quote, revision, customer, won day), shown on the
  quote line and carried to a revision of the quote. Migration 0014.
- UI: history card on each RFQ part; checkbox in the rate card's shop settings; green
  "Pre-filled from Q-1001" note on the line.

**Choices the next run should keep.**

- Revision match for pre-fill is stricter than part 1's `sameRevision`: both blank matches, one
  blank does not (a revision added since can mean a changed drawing).
- "Last won" orders by `decidedAt`, then sent, then created; ties go to the higher quote number,
  then revision number.
- The won-lines lookup chunks part numbers 50 per query (D1's bound-parameter cap; an RFQ's part
  count is not capped). A 60-part test covers the boundary.
- Old prices and snapshots are never reused; only inputs are.

**Next (ROADMAP item 9, part 3):** pre-fill on lines added by hand; a "won before at a different
revision" prompt tied to drawing comparison.

---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): repeat parts, part 3 (pre-fill on lines added by hand)

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#168.

**Why this item.** Bet #1 (payapps) had no free ROADMAP item that could be built now. Two were
gated ("once a customer asks", "once usage is measured"), the parts of items 1 and 5 were
claimed, and the GC portal formats are not public. Bet #2's item 9 had a free part, claimed as
`claim/jobshop-quote/repeat-parts-part-3-manual-lines`.

**What landed.**

- `src/shared/repeat-parts.ts`: `hasNoCostInputs` and `shouldPrefillOnSave`, both pure and
  unit-tested.
- `services/quotes` `addLine`/`updateLine`: with `shop_settings.prefill_repeat_parts` on, a line
  with no cost inputs yet whose save gives it a new, lookupable part number takes the last won
  line's inputs through the part-2 path (`wonLinesForParts` and `pickPrefillSource`). It keeps
  its own quantities, is priced from today's rate card and sets `prefilled_from`. No migration.
- Client: when the editor saves a line that comes back pre-filled, it loads the copied inputs,
  as "Use these inputs" does.
- New worker test `test/worker/repeat-parts-hand-lines.test.ts`: the typed-part path, the API
  path, the revision rule, no overwrite, a cleared line staying blank, opt-in, cross-tenant.

**Choices the next run should keep.**

- The trigger is "the part number changed on this save", not "the inputs are blank". If it were
  blank inputs, re-saving would fill a line the estimator had just cleared.
- A pre-filled line never fills again: `prefilled_from` is not null.

**Left for later (ROADMAP item 9):** clear a stale "Pre-filled from" label when the part number
of a pre-filled line is changed (RFQ lines have the same gap); a "won before at a different
revision" prompt that opens the drawing comparison.

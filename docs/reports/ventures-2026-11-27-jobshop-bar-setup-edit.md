---
kind: milestone
date: 2026-11-27
---
# jobshop-quote: a per-foot material's bar setup edited in place (2026-11-27)

Private-monorepo PR #448 (merged, squash 1cc07a76). ROADMAP Next #15, claim `material-per-foot-edit-in-place`, part 2d.
No migration and no API change: `PUT /rate-card/materials/:id` already took the whole row, and
`updateMaterial` already left the price date and history alone when the price did not change.
What was missing was the UI, and a way for drafts to notice the change.

## What landed
- `src/shared/material-bar-setup.ts` (pure):
  - `barSetupMoved` compares allowance, bar length, remnant and scrap the way the engine reads
    them. Spellings the engine prices the same are not a change: no allowance vs 0, a remnant on
    a row with no bar, scrap % on a row that has a bar.
  - `barSetupText` and `blankUseText` / `blankCheckText` call `barStockUse`, so the check uses
    the same arithmetic as the quote.
  - `lineMaterialNotes` wraps `linePriceNotes` and adds the bar-setup note after any price note.
    It lives here, not in `material-price.ts`, because `costing.ts` imports `material-price.ts`
    and putting it there would have made a cycle.
- `rate-card.tsx`: a "Bar setup" button on active per-foot rows opens `MaterialBarSetup`. It
  edits stock size, cut allowance, bar length, and remnant (or scrap % when no bar length is
  set), and has a "Check a blank (in)" box.
- `quote-detail.tsx`: switched to `lineMaterialNotes`.
- Customer post `docs/posts/2026-11-27-machine-shop-material-prices-in-quotes.md` gains the
  section "Changing how bar stock is cut and bought" (extended, not a new post).

## For the next run
- What is left of #15 depends on shop demand: "quotes this changes" for bar-setup moves (the
  draft line is the only place that says so today); several bar lengths per material with the
  cheapest whole-bar mix; supplier PDF price lists.
- Private CI was starved (runner_id 0, `ci_starvation.py` exit 0 on run 45924321576). Verified
  locally: `biome ci .`, typecheck, unit 631/631, worker 281/281, build, no client maps, e2e
  15/16 plus the full suite (see the run record's notes).

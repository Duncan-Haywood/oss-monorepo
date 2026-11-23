---
title: "Zero pounds of air: mutation testing three small calculators"
seo_title: "Dimensional weight rounding: when DIM and actual bill the same pound"
date: 2026-11-23
tags: [redteam, testing, mutation-testing, parcel-dim-weight-calculator, shop-rate-calculator, shopify-inventory-reorder-planner, javascript, ventures]
description: "Red team on three calculators: 14 of 24 seeded bugs caught, ten gaps closed, and a parcel tool that said '0 lb of it is air' about a box costing nothing extra."
---

Today's red-team run seeded eight bugs into the engine of each of three
calculators that changed on `main` in the last three days: the
[parcel dimensional weight calculator](https://marisstella.app/parcel-dim-weight-calculator/),
the [shop rate calculator](https://marisstella.app/shop-rate-calculator/) for
trades contractors, and the
[Shopify inventory reorder planner](https://marisstella.app/shopify-inventory-reorder-planner/).
Each suite runs in under a second.

## Seeded bugs: 14 of 24 caught

| File | Seeded | Caught | Gaps closed |
|---|---|---|---|
| `parcel-dim-weight-calculator/calc.mjs` | 8 | 6 | 2 |
| `shop-rate-calculator/calc.mjs` | 8 | 4 | 4 |
| `shopify-inventory-reorder-planner/calc.mjs` | 8 | 4 | 4 |

After the new tests all ten escaped mutants fail the suite (`redteam.py rerun`).
What escaped, in plain terms:

- **Limits tested only far past the line.** Additional handling was tested at
  50″ but never at exactly 48″, so `>` turning into `>=` slipped through. In
  the shop rate calculator nothing checked a field's maximum: 53 paid weeks a
  year passed. That now has one sweep test. Every field is checked at its own
  minimum and maximum and one step past each, and each limit the HTML form
  declares must match the arithmetic.
- **Assertions that were directional, not exact.** The reorder planner's
  surge test asserted the trend was "above 0.3", so a bug that added 2 to it
  passed. It now pins `recent / overall - 1`.
- **Output columns nobody read.** A flipped null check blanked every unit
  cost and order cost in the purchase-order CSV, and no test opened those
  columns.
- **A tiny but legal year.** "No hours left to work" fired at `<= 0`.
  Moving it to `<= 1` was never noticed, because no test priced a year with
  under an hour of work in it.

## The real bug: a box billed on air with no air in it

Both carriers' weights round **up to the next pound** before they are
compared. A 16 × 12 × 10″ carton is 1,920 in³, or 13.81 lb at a 139 divisor.
Put 13.7 lb of goods in it and the bill is 14 lb whichever weight you use.

The calculator compared the unrounded numbers, 13.81 against 13.7, and
said the package was billed on dimensional weight:

> You are billed for 14 lb of space to move 14 lb of goods — **0 lb of it is
> air.**

Then it suggested a shallower box, which would not have saved a cent.

The same rounding also understated the target. 4.2 lb of goods bills 5 lb,
so any carton up to 5 × 139 = 695 in³ costs the same 5 lb. The lever said
583.8 in³, about 16% too strict.

The fix compares the billed pounds, `ceil(dim) > ceil(actual)`, and solves the
break-even for the billed pound. The headroom figure now matches what the
carrier will charge. One older test had been built on the old arithmetic: its
"only 4.3% headroom" box really had 13.7%. It now uses a 7 lb box with 1.4%
headroom. The how-to page and README now say "rounded up to the next pound"
where they give the break-even rule.

This is an estimate tool, not a rate quote. Carrier terms vary, and some
accounts round differently. Check your own agreement.

The run record, with every mutant and its triage, is
`prompts/runs/2026-11-23-session_01E5sJKiyHBZ881B3W7YTfz3.json`.

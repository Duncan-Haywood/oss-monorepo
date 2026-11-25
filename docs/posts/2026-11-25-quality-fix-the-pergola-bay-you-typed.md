---
title: "Quality fix: the pergola post spacing you type is now a maximum"
seo_title: "Pergola post spacing: how many posts a pergola needs, and the beam length"
date: 2026-11-25
tags: [quality-audit, pergola-bid-calculator, for-customers, construction, estimating]
description: "The pergola bid calculator now treats post spacing as the longest beam span between posts, and counts the beam tails past each end post."
---

Type 8 feet into a "post spacing" box and you expect no beam to span more
than 8 feet. Until today the
[pergola bid calculator](../../ventures/pergola-bid-calculator/) did not
work that way. It counted posts as floor(side ÷ spacing) + 1, so **a 15-foot
side at 8-foot spacing got two posts and a 15-foot clear beam span**, and a
20-foot side got three posts at 10-foot bays. The price then had too few
posts, footings and knee braces, and too few hours to set them. Nothing
warned the estimator. The
[2026-11-20 quality census](2026-11-20-quality-census-seed-d447.md)
found it ([audit file](../../portfolio/quality/audits/2026-11-20-pergola-bid-calculator.json),
defect 0).

## What changed

- **Post spacing is a maximum.** Each side is split into the fewest equal
  bays no longer than the spacing, with at least the two corner posts. A
  15-foot side at 8 feet is now three posts and two 7.5-foot bays. A test
  walks every side from 4 to 40 feet against seven spacings and fails if
  any bay comes out longer than the spacing typed.
- **The page shows the bay.** Under the footprint it now says, for
  example, "Bays: 2 × 7.5 ft along the house, 2 × 5 ft on the projection",
  so the shop can size the beam for the longest bay from its own span
  table. The calculator still does not size members, and it does not
  replace a span table or an engineer.
- **The starting spacing is 12 feet.** At the old 8-foot default, the new
  rule would put a middle row of posts in every 10×10 frame, which is not
  how a 10×10 is built. At 12 feet the shipped examples keep the post
  counts the pages describe: four posts on a 10×10, six on a freestanding
  12×16, three on an attached one. Change it to whatever your beams span.
- **Beams get their tails.** Pergola beams usually run a foot or two past
  the end posts. Beam lineal feet were width × rows with no tail, so beam
  material and beam hours came out short (defect 2). A new "Beam overhang
  each end" box starts at 1 foot: a 10×10 freestanding frame now has 24
  lineal feet of beam, not 20.

## What it does to the price

On the shipped examples, with the form's default costs (a $32 wage, 30%
burden, 15% overhead, 25% target margin), the only change is the beam
tails, so every price goes up a little:

| job | price before | price now |
|---|---:|---:|
| 10×10 freestanding, 8 ft posts, open | $3,750.90 | $3,916.45 |
| 12×16 attached, 8 ft posts, slats | $6,454.54 | $6,537.31 |
| 12×16 attached, 10 ft posts, louvered, fan | $10,947.91 | $11,030.69 |
| 16×20 freestanding, 12 ft posts, polycarbonate | $15,723.06 | $15,971.38 |

The
[comparison with a flat $45 a square foot](../../ventures/pergola-bid-calculator/vs-a-flat-45-per-square-foot-special.html)
uses these numbers, and its test recomputes them from the engine. The flat
rate on the louvered 12×16 now clears a 4.2% margin, not the 5.0% the page
said before.

A shared link made before today keeps the spacing it carried. A link with 8
feet on a 10×10 now gets nine posts instead of four. That is what 8 feet
means as a maximum, but check the spacing on an old link before you send a
price from it.

## How we checked

- `node --test '*.test.mjs'` in the venture: 134 tests, all passing.
- Two seeded bugs, run with `platform/ci/quality_mutate.py`: putting the old
  floor rule back, and dropping the beam tails. The tests caught both.
- The page was loaded in Chromium. A 15×10 freestanding frame at 8 feet
  showed 9 posts, 51 lineal feet of beam and "2 × 7.5 ft" bays. A 2-foot
  overhang raised the beam to 57 lineal feet. There were no script errors.

Not fixed in this pass: the calculator still suggests no beam or rafter
size. The README's Limitations section lists it. A later quality round
re-audits the tool.

These are estimates built from the numbers you enter. They are not a
building-code opinion, a permit or an engineering stamp.

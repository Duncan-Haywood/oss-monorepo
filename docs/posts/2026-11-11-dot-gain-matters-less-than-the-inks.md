---
title: "Dot gain fixes a grey ramp and barely moves a painting"
seo_title: "Dot gain compensation for index screen prints: what it fixes"
date: 2026-11-11
tags: [clothing-design-studio, screen-printing, algorithms, research]
description: "Compensating for ink spread took a grey ramp from 3.39 to 0.78 delta E at 20% gain. On nine paintings it moved the print by 0.26 at most."
---

Earlier today the [Clothing Design Studio](https://marisstella.app/clothing-design-studio/)
got an index separation: a painting's few screen-print inks laid down as a
scatter of square dots, so the eye mixes them into shading. The obvious next
worry from any screen printer is *dot gain*. Ink spreads past the film on
press, so every dot prints a little bigger and the print comes out darker than
the file.

So the studio now does three things about it.

1. **A model.** A lone dot covers 1 plus the gain in cells, so each of its
   four neighbours takes a quarter of the gain. A cell takes that share from
   every neighbour printed after it: ink onto bare shirt, and a later ink
   over an earlier one, since screen printing goes wet on wet in print order.
2. **Compensation.** With a gain set, the dots are placed by model-based
   error diffusion, an idea from printer-model halftoning (Pappas and
   Neuhoff). Each candidate ink is judged by how the cell will really look
   next to the dots already placed, and the ink it spills onto them counts
   as error already spent. With the gain at zero you get the same dots as
   before, cell for cell.
3. **A way to measure it.** The page downloads a calibration strip per ink:
   a solid square, a 50% checkerboard of single dots, and bare shirt. The
   printer runs it on a proof. You pick three colours from one photo of it,
   and the page solves the model for the gain. In a checkerboard every bare
   cell touches four dots, so the inked share is 0.5 plus gain/200. It warns
   when the checkerboard comes out *lighter* than half, which means the mesh
   is dropping dots, not spreading them.

## What it fixes

A grey ramp printed in black dots on a white shirt, blurred as an eye would
see it, is 0.89 delta E from the original with no gain. Spread the dots by
20% and it drifts to 3.39. Compensated, it is 0.78. At 50% gain the
uncompensated print is 9.12 off and the compensated one 0.62. For one-ink
prints and anything tonal, the setting does its job.

## What it doesn't

Then we ran the same nine public-domain paintings as this morning (Van Gogh,
Munch, Turner, Hokusai, Matisse, Picabia, Sassoferrato, Barocci) with four
inks, and rendered each print at a true gain of 15% or 30%. The averages at
1 m:

| Shirt, true gain | No gain | Plain dots | Compensated | Compensated for double |
|---|---|---|---|---|
| white, 30% | 10.64 | 10.53 | 10.40 | 10.76 |
| near-black, 30% | 11.04 | 10.91 | 10.86 | 10.88 |

Nothing moves much. Four inks cannot mix many of a painting's colours, and
that gap of 10 or 11 delta E swamps everything else. Under our model the
spread even helps plain dots a little, because it blends them. Compensation
is worth 0.1 to 0.26.

Two findings carry over to a real press:

- **Guessing high is worse than not compensating.** Compensating for double
  the true gain beat plain dots on only 2 or 3 of the 9 paintings. Compensating
  for half the true gain did as well as the truth (9 of 9 better at 30% on
  white). If you can't measure, guess low.
- **For paintings, spend the effort on the inks.** Choosing inks for the
  dither, not for flat colour regions, is where the next gain is. Dot gain
  compensation matters more once those colours are within reach.

None of this has been on a real press. The spread model is a first-order
guess: no ink trapping, flash curing or squeegee direction. The calibration
strip exists so a printer's proof can show whether it holds. The method and
every number are in the studio's README under "Dot gain", and the
measurement script is `eval/index-gain.mjs`.

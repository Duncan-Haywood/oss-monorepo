---
title: "The dot a screen can't print: taking single dots out of an index separation"
seo_title: "Index separation without single dots for screen printing"
date: 2026-11-14
tags: [screen-printing, halftone, algorithms, open-source]
description: "Error diffusion leaves 6-9% of cells as lone dots a mesh may drop. Removing them, then searching under that rule, kept prints closer in 33 of 36 runs."
---

The [clothing design studio](/clothing-design-studio/) can print a painting on a shirt as an
*index separation*: a few spot inks laid down as a scatter of square dots, so that from a
metre away the eye mixes them into the painting's shading. The dots come from error diffusion,
the same family of algorithms that dithers a photo for a newspaper.

Error diffusion has one habit that screen printers know well. It leaves a lot of single dots:
one cell of an ink with no neighbour of the same ink. On the nine public-domain paintings we
test with, 5.8 to 9.3% of all cells are a dot like that. A single 0.3 mm dot is the first thing
a screen loses. The emulsion may not wash out round it, or the ink may not go through.

## How much that matters

We scored the same films on two imaginary presses: one that holds every dot, and one that loses
every single dot to bare shirt. The score is the mean colour difference (CIE76 delta E) between
the painting and the print after both are blurred the way an eye sees them from a given distance.
It is a rough model, not a person looking.

With four inks on a white shirt, plain dots score 10.64 from 1 m. On the press that drops single
dots they score 15.60. That is worse than printing flat colour (12.30).

## Taking them out

The new "Single dots" choice (on by default) does it in two steps.

1. **Cleanup.** Each single dot is either given up (the cell takes the shirt colour or a
   neighbour's ink, joining that neighbour's dot) or grown into a pair (a neighbour takes its
   ink). It picks whichever keeps the blurred print closer to the blurred painting. A move is only
   allowed if it creates no new single dot, so one pass leaves none.
2. **Refining.** Then any cell may switch ink if the print gets closer and no single dot appears.
   This is a direct binary search, the classic slow-but-good halftoning method, under the
   minimum-dot rule.

| Four inks on white, from 1 m | Press holds single dots | Press drops them |
|---|---|---|
| Plain dots | 10.64 | 15.60 |
| No single dots, cleanup only | 10.71 | 10.71 |
| No single dots, 3 refining passes | **10.17** | **10.17** |
| Search with single dots allowed | 9.66 | 15.19 |

Across 36 runs (nine paintings, three ink counts, white and near-black shirts), the refined
single-dot-free print was closer than plain dots from 1 m in 33. The three misses were by 0.04
or less. On the studio page at its full 0.3 mm grid it takes about 7 seconds.

## Two wrong turns

The first version judged moves by squared error in linear RGB. The refining passes then made the
print *worse* than no refining at all, because linear RGB barely counts errors in the darks. The
second version measured error in Lab, but linearised Lab at the painting's colour. The print sits
about 13 delta E away from that, so the search raised the true error (242 to 339 mean squared on
Starry Night). Linearising at the print's own colour, and redoing it each pass, fixed both. That
is Gauss-Newton, applied to halftoning.

## What isn't known

No screen has printed this yet. Whether a given mesh holds a pair of 0.3 mm dots, and loses
single dots at all, is for a proof. The next step is a pair strip on the calibration film. The
code is MIT licensed: `cleanLoneDots` in
`ventures/clothing-design-studio/indexsep.mjs`, and the eval that made the table is `eval/index-mindot.mjs`.

---
title: "Does a ship-scale wave-resistance formula work on a 4 m survey boat? Strip theory says it reads low by half"
seo_title: "Added resistance in waves for small boats: strip theory vs STAWAVE-2"
date: 2026-11-19
tags: [research, marine-hull]
description: "A stdlib strip-theory solver puts a 4 m survey monohull's wave resistance at 2.1 times the ITTC STAWAVE-2 figure; the hull ranking still holds."
---

This morning's step of the [marine-hull programme](../../research/marine-hull/README.md) asked whether real ocean waves change which hull carries a survey payload furthest. It used the ITTC's STAWAVE-2 formula for added resistance in waves, the one ship-trial analysts use, over 14,758 hourly sea states from NOAA buoys. The answer was no: the 4 m, 200 kg monohull lost 2.5% of its range at a 30 W payload. It came with a caveat, though. STAWAVE-2 is fitted to ships 50 to 400 m long with length/beam 4 to 9 and beam/draft 2.2 to 9. Our hull is 4 m long, length/beam 10 and beam/draft 1.46. Every number was an extrapolation.

So this step computed the same quantity a different way, one that needs no fit range. It uses the hull's own shape:

1. **Section by section.** Each cross-section of the Wigley hull gets its heave added mass and damping from Frank's 1967 close-fit source method, written from scratch in the Python standard library, complex exponential integral included.
2. **Heave and pitch.** Ordinary strip theory adds the sections up into the boat's motions in head waves.
3. **Added resistance.** The Gerritsma and Beukelman (1972) method turns the waves the boat radiates into a mean resistance.

The solver was checked before it was used. It matches reference values of the exponential integral to 1e-10, leaves a free-surface residual of 4e-6, radiates outgoing waves, and its damping agrees with the energy carried off by the waves to within 3% at 98.7% of table points. In waves 10 to 20 hull lengths long the boat simply rides the wave, as it should. The plan and six expectations went into the log before the run.

What came out (4 minutes on 4 cores):

| | STAWAVE-2 (7y) | strip theory (7z) |
|---|---|---|
| wave term at 1 m/s, pooled head seas | 1.39 N | 2.95 N |
| 30 W range loss, waves within 45° of the bow | 2.5% | 4.3% |
| 30 W range loss, every wave head-on | 9.4% | 15.1% |
| hydrofoil overtakes the monohull at | 651 W | 641 W |
| foil designs overtaking at or below 200 W | 0 of 972 | 0 of 972 |

On a hull this slender STAWAVE-2 reads low. The regular-wave peak from strip theory is 5.7 times STAWAVE-2's at the boat's Froude number of 0.16. Not all of that is the extrapolation, though. On a Wigley hull inside STAWAVE-2's range (length/beam 7, beam/draft 2.5), strip theory already peaks 2.6 times higher. Strip theory has no viscous damping, and STAWAVE-2 is an empirical fit, so the two disagree on ordinary ships too. Roughly 1.4 times of the gap, comparing areas under the curves, is what the slender, deep 4 m sections add on top. Which method is right at this slenderness needs tank data, and the classic Wigley tests weren't reachable from here.

Two of the six expectations failed. I expected strip theory to land within a factor of 2 of STAWAVE-2 on the in-range hull, and it came in at 2.6. I expected the pooled wave term within 0.7 to 2.8 N, and it came in at 2.95. The other four held, and they're the ones that matter for the paper. Under either method the monohull carries a survey payload furthest up to 200 W, none of the 972 hydrofoil designs overtakes it at or below that, and the boat's best speed stays at 1 m/s. The paper now gives the wave loss as a range across the two methods, 2.5% to 4.3%, instead of one number from a formula used outside its fit range.

The code is [`src/marine_hull/strip.py`](../../research/marine-hull/src/marine_hull/strip.py) (MIT, standard library only), with its tests in `tests/test_strip.py`. The results are in [`results_strip_added_resistance.txt`](../../research/marine-hull/experiments/results_strip_added_resistance.txt).

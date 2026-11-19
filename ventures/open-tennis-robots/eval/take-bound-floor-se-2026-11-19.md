# A standard-error floor on the take bound (2026-11-19, firmware/esp32/README.md, same title)

Item from `ventures/open-tennis-robots/NEXT.md` ("Buildable here"): "A noise-scaled floor on the TAKE_US = 0 bound
... Try a floor of k standard errors of the step's mean over the kept wheels (the board would send it); design on J-P,
W-Z, then a fresh held-out pair."

The fixed `host.TAKE_BOUND_FLOOR_PPM = 2` is needed (Y and Z: floor 0 missed 3 of 54 near-2 ms takes) but loosens the
bound on small-rms instant builds (5 of 12 at 1.5 ms against 8 at floor 0). A floor scaled to the survey's own noise
might keep the coverage and win that back.

## Design (all nine stored sets: J-L, M and N dense refits; O, P, W, X, Y, Z captures)

`tests/take_bound_floor_se.py` (new) rebuilds the board's tenths frame and the rows of the wheels its sums kept (the
shipped trim and blind rule), and replaces the 2 ppm floor (the 2% bar stays) with:

- **step**: k times the step's rms standard error over the kept wheels, `1e6 sd(w0) / sqrt(n) / (2 rms0)` in ppm, rounded
  to tenths (one number a frame, which the board could send);
- **pair**: k times the paired standard error of each candidate's rms over the step's, by wheel (one number a candidate);
- **cap**: min(2 ppm, k step SEs), the shipped floor lowered only where the survey is quiet.

393 builds were told TAKE_US = 0, 66 of them instant (eval/take-bound-floor-se-design-2026-11-19.txt):

| floor | covered (of 393) | instant bounded 1.5 ms (of 66) |
| --- | --- | --- |
| fixed 0 | 383 | 48 |
| fixed 2 ppm (shipped) | 393 | 41 |
| step 1 SE | 392 | 33 |
| step 2 SE (least k covering all) | 393 | 24 |
| pair 1 SE | 390 | 8 |
| pair 2 SE (least k covering all) | 393 | 0 |
| cap, k 1 | 392 | 42 |
| cap, k 2 and above | 393 | 41 (the shipped bound exactly) |

No SE floor that covers every design build is tighter than the fixed 2 ppm. The step SE (median 8 ppm, 90th
percentile 21.9) is mostly much larger than 2 ppm, because a few informative wheels carry most of each sum; the paired
SE is larger still, since the 1.5 ms candidate's gain over the step sits in those same few wheels. The cap shape, which
can only lower the floor, never finds a build where it is safe to.

**Why (eval/take-bound-floor-se-lost-2026-11-19.txt).** The seven instant builds that floor 2 loosens have a 1.5 ms gap
over the step of 0.2-1.9 ppm and a step SE of 0.9-6.2 ppm. The ten real takes that floor 0 misses have a gap of
0.3-1.8 ppm and an SE of 0.6-8.3 ppm. The two groups overlap on both, so no floor written from the step's noise can
bound the first at 1.5 ms without letting the second through. On these sets an instant take and a 2 ms one are simply
not told apart by their 1.5 ms candidate.

## Decision

Closed on design, before a held-out pair: the plan was to hold out the design's best SE floor, and none beat the
shipped floor on the design, so no held-out result could have moved anything. `host.TAKE_BOUND_FLOOR_PPM` stays 2;
nothing on the board or the Pi changed. Reopen only with a statistic that separates the two groups above on the
design sets first (a per-wheel straddle count, say, rather than a spread).

Simulated only, as the captures are.

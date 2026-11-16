# Clumping that grows with the level (NB1): pre-registration (2026-11-16)

Written before the NB1 cost or the law check below was run on any of the seeds named here.

## The fault

`--overdispersion nb` assumes the negative binomial's NB2 law, variance mu + mu^2 / r with one size r for the whole
series. Many count series clump in proportion to the level instead (NB1: variance phi mu, for example counts that
arrive in batches of a fixed typical size). On a series whose level moves a lot a single r cannot describe that law:
it overstates the variance at high levels and understates it at low levels, so the low stretch sprouts changes.
Measured before any change (probe, seed 7, 40 series per row, 200 counts, no change in any series, NB1 with phi 3 or
NB2 with r 8, `--trend bend` on the ramps; `eval/nb1-probe.out.txt`):

| false changes per series | NB2 cost (`nb`) | quasi-Poisson (`--overdispersion`) |
|---|---|---|
| NB1 phi 3, flat 20 | 0.07 | 0.97 |
| NB1 phi 3, ramp 7 to 700 | 0.38 | 0.57 |
| NB1 phi 3, ramp 2 to 200 | 0.68 | 0.47 |
| NB2 r 8, flat 20 | 0.10 | 0.88 |
| NB2 r 8, ramp 7 to 700 | 0.10 | 7.97 |
| NB2 r 8, ramp 2 to 200 | 0.10 | 4.42 |

So on NB1 counts that move, the shipped NB2 cost gives 4 to 7 times the false changes it gives when its law is right,
and the existing quasi-Poisson route is worse everywhere (a Poisson deviance scaled by one phi still rewards short
segments around a single high count).

## The change

1. `--overdispersion nb1`: a negative-binomial cost under the NB1 law, size lam e_t / delta per point (delta = phi - 1,
   p = 1 / (1 + delta) fixed), the segment's rate lam at its moment estimate S / E (no closed-form maximum). O(segment
   length) per segment, like the NB2 cost with exposures. Works with `--period` and `--trend` (exposures) as `nb` does.
2. `nb1Dispersion(x, exposure)`: phi from first differences read against the 7-point local level, as `negbinSize`
   does for NB2: solve mean min(d^2 / (2 phi m), 6.635) = 0.9813; Poisson (phi 1) unless phi = 1 is rejected by two
   standard errors.
3. `clumpingLaw(x)`: fit both laws to the same differences and compare the capped mean of z on the lower and upper
   halves of the local level; the right law leaves the two halves equal. Says "nb1", "nb2" or "either" (both within
   two standard errors, or the level spans less than 3 times).

## Bars (all must hold, or it does not ship)

Fresh seeds, 100 series of 200 counts per cell, run once. `eval/nb1.mjs 9701 9702 9703 9704`.

1. NB1 phi 3, ramps 7 to 700 and 2 to 200, `--trend bend`, no change (seed 9701): false changes per series with
   `nb1` at most half those with `nb` in both ramps, and at most 0.2.
2. NB2 r 8, the same two ramps (seed 9702): `nb1` is opt-in, so no bar on its false changes there, but they are
   reported; the law check must say "nb2" or "either" on at least 85 of 100 in each ramp.
3. Law check on NB1 ramps (seed 9701 series): "nb1" or "either" on at least 85 of 100 in each ramp, and "nb1" on at
   least 60 of 100 on the 7-to-700 ramp (it must have power where the level moves 100-fold).
4. Power (seed 9703): NB1 phi 3 on the 7-to-700 ramp with one step x1.6 at a random point 70 to 130: a change found
   within 5 points of the step with `nb1` on at least as many series as with `nb`.
5. Dispersion (seed 9704): median `nb1Dispersion` on NB1 phi 3 (flat 20 and the 7-to-700 ramp) within 15% of 3, and
   phi 1 on at least 90 of 100 plain Poisson ramps.
6. Every existing test passes (nothing changes unless `nb1` is asked for).

If any bar fails, `nb1` does not ship as an option; the functions stay in `eval/` with the result written down.

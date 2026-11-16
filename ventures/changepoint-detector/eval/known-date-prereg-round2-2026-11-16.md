# Pre-registration, round 2: the known-date test with a matched rho (2026-11-16)

Written after round 1 (eval/known-date-prereg-2026-11-16.md) and before round 2's simulation or real runs.

**Round 1 failed its size bar.** 400 null series per cell, 199 replicates (eval/known-date-sim-round1.out.txt):
at n 40, rho 0.8 the bootstrap rejected in 13.6% (date at 50%) and 8.9% (date at 80%) of tested series, against
a bar of 2-8%; every other cell was 3.3-6.8%. The real series all met their predictions (eval/known-date-real.out.txt,
run with round 1's code), but the bar said nothing ships unless both hold, so round 1 does not ship.

**Why, as far as an exploratory check shows.** The bootstrap draws its null series at the Kendall-corrected rho of
the null fit, capped at the guard (0.7 under 100 points). With a line (and seasons) on 40 points the GLS rho is
biased low by more than Kendall's formula corrects, and the cap holds the generator at 0.7 when the truth is 0.8,
so the null replicates are less sticky than the data and the bar too low. One exploratory run (200 series, seed
base 777, not reused below) at n 40, rho 0.8: 10.2% with round 1's generator; 10.2% with a matched rho still
capped at the guard; 5.8% with a matched rho capped at 0.95.

**Change.** The generator's rho is found by indirect inference (Gourieroux, Monfort and Renault 1993): the rho
whose GLS estimate on the same null design averages the observed one (a grid from -0.9 to 0.98, 80 simulated
series per grid point, common random numbers, cached per design), capped at 0.95 rather than at the guard. The
guard itself is unchanged.

**Bars, on fresh seeds (seed base 5000; `node eval/known-date-sim.mjs 400 199 matched`).** Size at p <= 0.05 within
2-8% in all 12 round-1 cells, and in the extra cells n 60 rho 0.8 and 0.9, n 120 rho 0.9 and n 40 rho 0.9
(reported for all; the bar applies to the 12 round-1 cells and n 60 rho 0.8). Random walks: reported.
Real series A-D with round 2's code: the same predictions as round 1, which must still hold. If both hold, the
test ships (CLI `--known-date`, page, agent tool) with the matched rho as its only generator. If not, nothing
ships and the README says so.

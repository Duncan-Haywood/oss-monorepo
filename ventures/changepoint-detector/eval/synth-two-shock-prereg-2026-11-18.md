# Pre-registration: two shocked donors, and a shocked best match, with few units (2026-11-18)

Written after one exploratory run (`eval/synth-two-shock-explore.out.txt`, base 84000, 100 panels a cell) and
committed before the confirmatory run (base 85000, 400 panels a cell, `eval/synth-two-shock-confirm.out.txt`).

## Why

README "Few donors: size and power" found that one donor with its own after-date shock as large as the effect cuts
the placebo test's rank-1 share from 54-60% to 35-40%, that leaving it out beforehand restores it, and that the
estimate is untouched because a random donor carries little weight. Its limits: "two shocked donors and a shocked
donor that is also the treated unit's best match are untested. Next: ... two shocked donors at 11-16 units." West
Germany had two donors above it (the Netherlands, Norway) and the Basque Country three, so two is the realistic case,
and a user often knows of one event and not the other.

## Design (`eval/synth-two-shock-sim.mjs`)

The shipped generator in N1's shape (two AR(1) factors, idiosyncratic sd 0.5, 19 points before, 12 after) at 11 and
16 units. Unit 0 is treated; shocks are steps from the date with a sign drawn per donor per panel. Cells per U:

- P_U: effect -1.0, clean donors. PD_U: effect -1.0, one donor shocked by 1.0 (replicates the earlier cell).
- NDD_U: no effect, two donors shocked by 1.0. PDD_U: effect -1.0, two donors shocked by 1.0. PEE_U: by 2.0.
- PB_U: effect -1.0, the one shocked donor (1.0) is the treated fit's heaviest donor (weights from the
  before-period, found before the shock is added).

Shipped defaults. Each panel is refitted with the first shocked donor left out beforehand (excl1) and with every
shocked donor left out (exclAll).

## Bars (confirmatory run)

1. **Size.** NDD_U rank-1 share at most 1/U + 4 points.
2. **Two shocks cost more than one.** PDD_U rank-1 share at least 5 points below PD_U's, in each U.
3. **Two shocks of twice the effect leave about nothing.** PEE_U rank-1 share at most 10%.
4. **Leaving both out restores it.** exclAll rank-1 share in PDD_U and PEE_U within 8 points of P_U's, or above.
5. **Leaving one of two out is not enough when the other is large.** PEE_U excl1 rank-1 share at most 15%.
6. **A shocked best match moves the estimate.** PB_U mean absolute error of the effect at least 1.3x P_U's.
7. **Leaving the best match out does not buy the precision back** (the exploratory run's surprise, predicted
   here): PB_U excl1 mean absolute error at least 1.15x P_U's.
8. **The "ranked above" list names a culprit.** Pooled over PDD and PEE, of panels not at rank 1, at least 80% have
   at least one shocked donor at or above the treated unit.

Reported, no bar: rank <= 2 and <= 3, the plain ratio's rank-1 share, the shocked donors' weight, both-above share,
PB's rank-1 share, PDD's excl1 rank-1 share.

## Product change decided now, whatever the bars say

1. The FEW DONORS note (CLI and page) adds the confirmatory rank-1 share with two donors shocked by the effect's size
   at the nearest of 11 and 16 units, and with both left out beforehand; if bar 5 holds it says that leaving out one
   of two is not enough.
2. The "ranked above" note: when a unit listed above the treated one carries at least 0.2 of the weight in the
   treated unit's synthetic control, it says so and that an event of its own after the date moves the estimated gap
   too (by about its weight times its shock), not only the rank; if bar 7 holds, it adds that leaving it out
   beforehand did not restore the estimate's precision in simulation (the fit gets worse without it), so report the
   gap both ways.

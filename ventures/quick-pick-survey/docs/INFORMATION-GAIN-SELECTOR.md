# Information-gain pair selector (measured, opt-in)

`selectNextPairByInformation` in `src/lib/pairing.ts` picks the pair whose one
answer is expected to shrink the two items' rating variance most under the
Glicko model (`expectedVarianceReduction`: Fisher information
`g(phi_opp)^2 p(1-p)` per side). The shipped `selectNextPair` stays the app's
policy; this one is not wired in.

## Measurement

`src/lib/infoGainPairing.simulation.test.ts`: the same synthetic respondent and
real Glicko-2 loop as `pairing.simulation.test.ts`, 10 seeded respondents per
cell, medians. Rank accuracy is Spearman over **all** items.

| items | answers | items rd<200 (shipped / info) | items rd<150 | rank accuracy |
|---|---|---|---|---|
| 41 | 90 | 23 / 31 | 5 / 1 | 0.61 / 0.67 |
| 41 | 300 | 41 / 41 | 41 / 41 | 0.87 / 0.90 |
| 220 | 90 | 23 / 31 | 5 / 1 | 0.14 / 0.18 |
| 220 | 300 | 58 / 73 | 34 / 70 | 0.32 / 0.36 |

## Reading it

It wins on rank accuracy everywhere and doubles the items under rd 150 at 300
answers on the 220-item survey. At 90 answers it spreads answers thinly, so
fewer items reach rd 150 (1 against 5), which is the bar the couple screen
needs. It also ignores two things the shipped selector encodes on purpose:
cross-dimension pairs (the trade-off observations) and the coarse-to-fine
category phases. So it is not a drop-in replacement.

## Conflict bonus and coverage term (measured 2026-10-20, dropped)

`selectNextPairByInformation(input, { conflictBonus, coverageWeight })` takes
the two things the shipped selector has that this one lacked: the 1.5x
multiplier for a pair whose primary dimensions differ, and a coverage term
(`1 + w * (lag_a + lag_b)`, lag = appearances below the pool average). Both
default to off. Same 10 seeded respondents per cell; `conflict` = 1.5x only,
`coverage` = 1.5x plus w=0.5.

| items / answers | rd<150 shipped / info / conflict / coverage | rank accuracy |
|---|---|---|
| 41 / 90 | 5 / 1 / 1 / 0 | 0.61 / 0.67 / 0.67 / 0.67 |
| 41 / 300 | 41 / 41 / 41 / 41 | 0.87 / 0.90 / 0.89 / 0.88 |
| 220 / 90 | 5 / 1 / 1 / 0 | 0.14 / 0.18 / 0.16 / 0.18 |
| 220 / 300 | 34 / 70 / 68 / 70 | 0.32 / 0.36 / 0.36 / 0.36 |

Neither term moves rd<150 at 90 answers (1 or 0 items against the shipped 5),
and the conflict bonus costs a little rank accuracy at 300 answers (0.90 ->
0.89, 0.18 -> 0.16 at 220 items/90). In this simulation every item has one
dimension drawn at random, so the bonus only reweights near-equal scores; it
cannot buy the missing trade-off observations. The coverage term is worse for
rd<150 because an exact scorer already spreads answers thinly; adding spread
lowers the count of items that get deep enough.

So the gap at 90 answers is structural, not a missing term: 90 answers give
180 appearances, and an item needs about ten to fall under rd 150, so at most
18 items can get there and the argmax scorer spreads them over ~30. The
selector stays opt-in and unwired.

## Staged hybrid (measured 2026-10-21)

`selectNextPairHybrid(input, { switchAt })` runs the shipped selector while
`answeredCount < switchAt` (default `HYBRID_SWITCH_ANSWERS` = 120) and the
information selector after. Same 10 seeded respondents per cell; shipped /
info / hybrid@120:

| items / answers | rd<150 | rank accuracy |
|---|---|---|
| 41 / 90 | 5 / 1 / 5 | 0.61 / 0.67 / 0.61 |
| 41 / 300 | 41 / 41 / 41 | 0.87 / 0.90 / 0.89 |
| 220 / 90 | 5 / 1 / 5 | 0.14 / 0.18 / 0.14 |
| 220 / 300 | 34 / 70 / 66 | 0.32 / 0.36 / 0.36 |

Below 120 answers it is the shipped selector, so the couple screen's bar is
unchanged; at 300 answers on 220 items it keeps 66 of the 70 settled items and
the rank gain. Switching at 60 answers helps rank at 41 items/90 answers
(0.70) but gives 2 items under rd 150 against 5; switching at 200 leaves 31
settled items at 220/300 and no gain. 120 is the switch point that never loses
to the shipped selector on either measure in these cells; the test asserts it.
Not wired in yet. Next: a per-survey `pairSelector` flag (prisma field, admin
toggle).


## Switching it on

`PAIR_SELECTOR=staged` in the deployment's environment makes
`/api/trials/next` use `selectNextPairHybrid`. Unset, the shipped selector runs
as before. It is a process-wide switch; a per-survey setting (column,
migration, builder checkbox) is the next step.

## Choosing it per survey

`Survey.pairSelector` (migration `20261021000000_survey_pair_selector`) is
`null`, `"standard"` or `"staged"`. `POST /api/admin/surveys` accepts it as
`pairSelector`, and the admin form has a "Question order" menu. `/api/trials/next`
uses the survey's value when set and otherwise follows the `PAIR_SELECTOR`
environment variable, so existing surveys behave as before. `staged` helps
long lists answered at length (see above); for short lists it equals the
standard selector for the first 120 answers.

## Latency at long lists

The information score scores every pair in the active pool, so it is quadratic
in list length. Measured by `src/lib/pairLatency.test.ts` (selector compute
only, median of 15 calls, one cloud container, 2026-10-21; the route adds a
few indexed queries on top, not run against a live database):

| items | answers | shipped | information | staged |
|---|---|---|---|---|
| 50 | 300 | 0.04 ms | 0.8 ms | 0.7 ms |
| 220 | 90 | 0.12 ms | 6.3 ms | 0.13 ms |
| 220 | 300 | 0.15 ms | 17.8 ms | 18.6 ms |
| 500 | 300 | 0.33 ms | 66 ms | 67 ms |

At 220 items the worst case is under 20 ms, so a pair request is dominated by
the database round trips, not the selector. At 500 items it is 67 ms; a list
much beyond that should cap the pool before using `staged`.

### Pool cap (2026-10-21)

`selectNextPairByInformation` now scores at most `INFO_POOL_CAP` (400) items,
the ones with the largest rd (then least shown); `poolCap` in the options
overrides it, and lists at or under the cap are untouched (tested: same pair
as uncapped). Median of 5 calls with 600 answers, one cloud container, selector
compute only (throwaway script, not committed):

| items | uncapped | cap 400 |
|---|---|---|
| 500 | 56 ms | 36 ms |
| 1000 | 252 ms | 58 ms |
| 3000 | 1983 ms | 36 ms |

### Rank accuracy with the cap (measured 2026-10-22)

`src/lib/poolCap.simulation.test.ts`: the same respondent and Glicko-2 loop,
3 seeded respondents per cell (medians; small, so read it as "no sign of a
loss", not a tight interval), 600 answers. Set `MEASURE_OUT=file` to keep the
numbers.

| items | items rd<150 shipped / capped / uncapped | rank accuracy |
|---|---|---|
| 600 | 74 / 130 / 130 | 0.233 / 0.272 / 0.272 |
| 1000 | 72 / 130 / 130 | 0.126 / 0.156 / 0.156 |

Capped and uncapped are identical to three decimals: with answers this few
the scorer only ever picks from the most uncertain items, which is the set the
cap keeps. So the cap is a latency guard that costs nothing in these cells.
At 3000 items (2026-10-22, 2 seeded respondents, 600 answers, selector loop
only, no uncapped arm because it is minutes per run): items rd<150 73 shipped /
131 capped, rank accuracy 0.051 / 0.057. The cap still beats the shipped
selector; the margin is small and the sample is two respondents. Not measured:
the same check through the HTTP route with Postgres.

### Budgets well past the list length (measured 2026-10-26)

`poolCap.simulation.test.ts`, "budgets well past the list length": 500 items
(above the 400 cap), 2 seeded respondents per cell (medians; small), so 4 and 8
answers per item.

| answers | items rd<150 shipped / capped / uncapped | rank accuracy |
|---|---|---|
| 2000 | 226 / 410 / 410 | 0.727 / 0.763 / 0.758 |
| 4000 | 494 / 500 / 500 | 0.887 / 0.899 / 0.895 |

The cap does not hide items at these budgets: capped matches uncapped (within
0.005) and both beat the shipped selector. Only 500 items and 2 respondents
were run, so this rules out a large loss, not a small one; 1000+ items at deep
budgets (minutes per uncapped run) are not measured.

## Budgets well past the list length (2026-10-26)

`longBudget.simulation.test.ts`: 30 items, medians of 5 seeded respondents,
rank accuracy (Spearman against the true order) by number of answers. With 30
items the cap never binds, so this tests whether the selectors keep improving
once most of the 435 pairs have been seen, not the cap itself.

| answers | shipped | information | hybrid |
|---|---|---|---|
| 30 | 0.556 | 0.527 | 0.556 |
| 120 | 0.832 | 0.873 | 0.832 |
| 300 | 0.928 | 0.934 | 0.897 |
| 600 | 0.950 | 0.965 | 0.963 |
| 1200 | 0.960 | 0.976 | 0.980 |

No stall: every selector keeps rising, and from 600 answers (20 per item) the
information selector and the hybrid both lead the shipped one by 1.5 to 2
points. Two things to read carefully: at 300 answers the hybrid (0.897) is
below the shipped selector (0.928), the one cell where it loses, probably the
hand-over just after the switch point, and with 5 seeds a 0.03 gap is within
noise, so it is a flag, not a finding; and the respondent is the synthetic
Bradley-Terry one, so the lead on real, inconsistent people is unmeasured.

## The 300-answer dip and an inconsistent respondent (2026-10-27)

`hybridDip.simulation.test.ts`: 30 items, 20 seeded respondents per cell (the
earlier table used 5), mean rank accuracy. `lapse` is the share of answers
given at random, so 0.2 is a respondent who contradicts their own taste one
time in five.

| answers | lapse | shipped | information | hybrid |
|---|---|---|---|---|
| 120 | 0 | 0.752 | 0.778 | 0.752 |
| 300 | 0 | 0.886 | 0.896 | 0.891 |
| 600 | 0 | 0.940 | 0.945 | 0.945 |
| 120 | 0.2 | 0.714 | 0.646 | 0.714 |
| 300 | 0.2 | 0.855 | 0.797 | 0.870 |
| 600 | 0.2 | 0.907 | 0.886 | 0.929 |

- The hybrid's dip at 300 answers (0.897 against 0.928 on 5 seeds) was seed
  noise: on 20 seeds the hybrid is 0.891 against 0.886.
- With random answers the information selector alone is worse than the shipped
  one at 120 and 300 answers (0.646 and 0.797 against 0.714 and 0.855), because
  it keeps probing pairs whose answers contradict each other. The hybrid
  never falls below shipped here and leads by 1.5 to 2 points at 300 and 600.
  That supports shipping the hybrid, not the information selector alone.
- Still synthetic: a random-lapse respondent, one lapse rate, 30 items.

## Lapse rates from 0.05 to 0.5 (2026-10-27)

`lapseSweep.simulation.test.ts`: 30 items, 20 seeded respondents per cell, mean
rank accuracy, same respondent as above.

| answers | lapse | shipped | information | hybrid |
|---|---|---|---|---|
| 120 | 0.05 | 0.763 | 0.753 | 0.763 |
| 300 | 0.05 | 0.889 | 0.895 | 0.896 |
| 120 | 0.1 | 0.754 | 0.768 | 0.754 |
| 300 | 0.1 | 0.892 | 0.881 | 0.887 |
| 120 | 0.35 | 0.654 | 0.629 | 0.654 |
| 300 | 0.35 | 0.789 | 0.780 | 0.797 |
| 120 | 0.5 | 0.525 | 0.496 | 0.525 |
| 300 | 0.5 | 0.666 | 0.640 | 0.684 |

- The hybrid never falls below shipped by more than 0.005 (lapse 0.1 at 300)
  and leads at 0.35 and 0.5 (+0.008, +0.018 at 300 answers). It equals shipped
  at 120 answers because it has not yet switched. The information selector
  alone is worse than shipped at both budgets once lapse reaches 0.35.
- Gaps under about 0.01 are within seed noise at 20 seeds; this supports
  keeping the hybrid, not a claim that it helps at low lapse.
- Still synthetic: random lapses only, 30 items (position bias: next section).

## A respondent who favours the first option (2026-10-28)

`biasedRespondent.simulation.test.ts`: `simulate(..., positionBias)` makes that
share of answers pick the first option shown whatever the items are. 30 items,
20 seeded respondents per cell, mean rank accuracy.

| answers | bias | shipped | information | hybrid |
|---|---|---|---|---|
| 120 | 0.1 | 0.748 | 0.761 | 0.748 |
| 300 | 0.1 | 0.880 | 0.879 | 0.900 |
| 120 | 0.3 | 0.655 | 0.618 | 0.655 |
| 300 | 0.3 | 0.780 | 0.742 | 0.803 |
| 120 | 0.5 | 0.427 | 0.405 | 0.427 |
| 300 | 0.5 | 0.632 | 0.421 | 0.592 |

- The hybrid leads at bias 0.1 and 0.3 (+0.020, +0.023 at 300 answers) but
  trails shipped by 0.040 at bias 0.5, where half the answers carry no signal.
  The information selector alone collapses there (0.421 against 0.632).
- Why it matters: first-option bias is common in real surveys. A bias of 0.5 is
  an extreme respondent; it marks where the hybrid's switch to the information
  selector stops paying, not a typical case.
- Still synthetic and 30 items. Open: a detector that falls back to the shipped
  selector when a respondent's first-option share is far above half.

### First-option fallback (2026-10-27)

`selectNextPairHybrid` now reads `firstOptionShare` (the share of a person's
decided A/B answers that picked the first-listed option, from 30 decided
answers on, computed in `/api/trials/next`) and uses the shipped selector when
it is at or above `FIRST_OPTION_FALLBACK_SHARE` (0.7). Slots are randomised, so
an unbiased share sits near 0.5; bias 0.5 gives about 0.75.
Same harness, 30 items, 20 seeds, 300 answers (the sweep above had a hybrid of
0.592 at bias 0.5):

| bias | shipped | hybrid with detector |
|---|---|---|
| 0 | 0.893 | 0.928 |
| 0.1 | 0.880 | 0.900 |
| 0.3 | 0.780 | 0.803 |
| 0.5 | 0.632 | 0.651 |

The detector changes only the bias 0.5 cell (0.592 to 0.651, now above shipped);
the others equal the earlier runs. Caveats: the harness does not randomise
slots, so the detector's false-trigger rate under the route's real randomisation
is unmeasured; synthetic, 30 items. Open: the same through the route with
Postgres; a bias toward the *second* option (a share at or below 0.3) is not
handled (closed below).

### Second-option fallback (2026-10-27)

`positionBias` in the harness now takes a negative value (that share of answers
pick the second option shown). The detector in `selectNextPairHybrid` is
symmetric: it uses the shipped selector when the first-option share is at or
above 0.7 **or at or below 0.3**. Same harness, 30 items, 20 seeds, 300 answers
(`biasedRespondent.simulation.test.ts`, "second-option fallback"):

| second-option bias | shipped | information | hybrid before | hybrid now |
|---|---|---|---|---|
| 0.1 | 0.875 | 0.876 | 0.891 | 0.891 |
| 0.3 | 0.786 | 0.730 | 0.799 | 0.793 |
| 0.5 | 0.657 | 0.410 | 0.574 | 0.666 |

At bias 0.5 the hybrid was 0.083 below shipped and is now 0.009 above it. At
0.3 the detector fires only on some seeds (the expected share is 0.35, near the
0.3 line) and the hybrid gives up 0.006, inside seed noise. Caveats: the harness
does not randomise slots (the route does, so a real share sits near 0.5 for an
unbiased person and the false-trigger rate through the route is unmeasured);
synthetic, 30 items. Unit test: `pairing.test.ts`. Open: the same through the
route with Postgres; 1000+ items at deep budgets.

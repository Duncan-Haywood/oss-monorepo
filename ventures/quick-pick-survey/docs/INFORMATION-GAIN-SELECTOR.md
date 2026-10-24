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
the same check through the HTTP route with Postgres, and budgets well past the
list length, where the cap could start to hide items.

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
route with Postgres at 1000+ items with several respondents and noisy answers.

### Through the route, 1000 items (2026-10-30)

`src/app/api/trials/deepBudget.integration.test.ts`: one survey of 1000 items
(`pairSelector: "staged"`), one respondent with a noiseless hidden order,
answering through the real `trials/next` and `trials/answer` routes against
local Postgres 16. Latency is the `next` call alone.

| answers | next() p50 / p95 / max | items rated | Pearson(order, stored rating), rated items |
|---|---|---|---|
| 300 | 15 / 19 / 37 ms | 73 | 0.879 |
| 1000 | 22 / 37 / 60 ms | 213 | 0.733 |

The route adds no stall at depth: the question stays under 60 ms with 1000
answers behind it (the 400-item pool cap holds). Honest limits: one run, one
respondent, no noise, no bias; a single respondent touches only 7% to 21% of
1000 items at these budgets, so a 1000-item survey needs many respondents to
rank everything. The correlation is over rated items only and falls from 0.88
to 0.73 as more items enter at default rating, which is not a ranking quality
claim. Reproduce: `scripts/test-db.sh start`, then
`DEEP_OUT=/tmp/o.txt DEEP_ANSWERS=1000 npx vitest run -c vitest.integration.config.ts src/app/api/trials/deepBudget`.

### Through the route, several respondents with noise and slot bias (2026-11-01)

`src/app/api/trials/noisyRespondents.integration.test.ts`: 60 items, the
`staged` selector, 3 respondents per condition x 200 answers each, through the
real `trials/next` and `trials/answer` routes against local Postgres 16. Hidden
order: lower sort order wins. "Lapse" is a random answer instead of the true
one; "bias" is always answering the top slot with that probability. Rank
quality is Spearman between the hidden order and the stored rating over the
items each respondent rated (mean of 3).

| condition | Spearman | top-slot share of answers |
|---|---|---|
| clean | 0.772 | 0.51 |
| 20% lapse | 0.708 | 0.54 |
| 50% top-slot bias | 0.527 | 0.76 |
| 80% top-slot bias | 0.065 | 0.93 |

Reading: the unbiased person sits at 0.51 (the route shuffles slots), so the
`>= 0.7` fallback has no reason to fire for them; 20% lapse costs 0.06 of
Spearman; a 50% bias is heavy damage and an 80% bias leaves almost no signal,
which no selector can recover. Honest limits: synthetic answers, 3 respondents
per cell, one seed set, 60 items. This does **not** isolate the fallback: there
is no run with the fallback switched off to compare, so it shows the share the
route sees, not what the fallback saved. Reproduce: `scripts/test-db.sh start`,
then `NOISY_OUT=/tmp/o.txt npx vitest run -c vitest.integration.config.ts src/app/api/trials/noisyRespondents`
(about 50 s).

### The fallback switched off, as a control (2026-11-02)

Same test, two added conditions: the biased respondents again with the route
calling the staged selector without their first-option share (a `vi.mock` of
`selectNextPairHybrid` that drops `firstOptionShare`), so it never falls back
to the shipped selector. Same 60 items, 3 respondents x 200 answers, local
Postgres 16. The 2026-11-01 table above used a different seed per condition
name, so its numbers differ slightly from the clean/lapse/bias rows here.

| condition | fallback on | fallback off |
|---|---|---|
| clean (share 0.51) | 0.777 | not run (cannot fire) |
| 20% lapse | 0.629 | not run (cannot fire) |
| 50% top-slot bias (share 0.77 / 0.74) | 0.492 | 0.482 |
| 80% top-slot bias (share 0.93 / 0.91) | 0.266 | 0.096 |

Reading: at 80% bias the fallback keeps 0.17 of Spearman that the information
selector alone loses (0.266 against 0.096); at 50% bias the difference (0.010)
is inside the noise of 3 respondents. So the fallback earns its keep on heavy
bias and does nothing measurable at moderate bias. Honest limits: 3
respondents per cell, one seed set, synthetic answers, 60 items, 200 answers;
the 2026-11-01 run had clean at 0.772 and lapse at 0.708 on other seeds, so a
0.06 to 0.08 spread between seed sets is normal here and the 50% row is not
distinguishable. Not run: 1000+ items.
Reproduce as above (about 70 s).

### The same at 1000 items (2026-11-02)

Same test with `NOISY_ITEMS=1000 NOISY_ANSWERS=1000 NOISY_RESPONDENTS=3` (the
test now reads these; defaults stay 60/200/3). 3 respondents x 1000 answers
per condition, through the real routes and local Postgres 16, 602 s in all.
At 1000 answers on 1000 items each item is seen about twice, so these are
low-data ranks and not comparable with the 60-item table.

| condition | top-slot share | Spearman, fallback on | fallback off |
|---|---|---|---|
| clean | 0.48 | 0.619 | not run |
| 20% lapse | 0.50 | 0.443 | not run |
| 50% top-slot bias | 0.76 | 0.374 | 0.312 |
| 80% top-slot bias | 0.91 | 0.212 | 0.060 |

Reading: the fallback helps at both bias levels here (+0.06 at 50%, +0.15 at
80%), where at 60 items the 50% case showed no difference. One seed set and 3
respondents per cell, so treat the 50% gap as suggestive. Reproduce:
`NOISY_ITEMS=1000 NOISY_ANSWERS=1000 NOISY_OUT=/tmp/o.txt npx vitest run -c vitest.integration.config.ts src/app/api/trials/noisyRespondents`.

### The same at 3000 answers on 1000 items (2026-11-04)

Same test, `NOISY_ITEMS=1000 NOISY_ANSWERS=3000 NOISY_RESPONDENTS=3
NOISY_TIMEOUT_MS=7000000` (the new timeout knob; the old fixed 15 minutes
killed the first attempt). Through the real routes and local Postgres 16,
2419 s in all. Each item is seen about six times.

| condition | top-slot share | Spearman, fallback on | fallback off |
|---|---|---|---|
| clean | 0.50 | 0.545 | not run |
| 20% lapse | 0.50 | 0.261 | not run |
| 50% top-slot bias | 0.75 | 0.323 | 0.149 |
| 80% top-slot bias | 0.90 | 0.198 | 0.100 |

Reading: the fallback again helps at both bias levels (+0.17 at 50%, +0.10 at
80%), which supports the 1000-answer result. **An unexplained result:** the
clean and lapse rows are *lower* than at 1000 answers (0.619 and 0.443), when
three times the data should raise them. One seed set and 3 respondents per
cell; a 0.06 to 0.08 seed spread was seen before, but this gap is larger than
that. Not investigated yet: whether the staged selector's later phase hurts
rank quality on long budgets over a big pool, or whether the Spearman over
"every item the respondent rated" changes meaning as coverage grows (more
items rated at the tail). That is the next thing to check, with the same
seeds at 1000 and 3000 answers and the rated-item count reported.
Reproduce: the command in the previous section with `NOISY_ANSWERS=3000
NOISY_TIMEOUT_MS=7000000` (about 40 min).

### Why 3000 answers scored below 1000: a coverage effect (2026-11-04)

Same test, clean condition only, 1000 items, 3 respondents, the new
`NOISY_CONDITIONS=clean NOISY_CHECKPOINTS=500,1000,1500,2000,3000`, which reads
Spearman and the rated-item count along each respondent's own run (571 s,
through the real routes and local Postgres 16). Mean of the 3 respondents:

| answers | rated items | Spearman over rated items |
|---|---|---|
| 500 | 113 | 0.812 |
| 1000 | 213 | 0.623 |
| 1500 | 313 | 0.504 |
| 2000 | 413 | 0.436 |
| 3000 | 613 | 0.546 |

Reading: the three respondents agree to within 0.03 at every checkpoint, so the
dip is not seed noise. The route rates about 100 new items per 500 answers, and
the Spearman is taken over rated items only, so each checkpoint scores a larger,
harder set (113 items, then 613). Within a fixed set the order improves with
answers; the score falls while the set keeps widening and recovers once the
widening slows (rise from 2000 to 3000). The 0.619 vs 0.545 gap is therefore a
change in what is measured, not a worse selector. Not done: a fixed-set score
(Spearman over the first 113 items rated, at every checkpoint) would show the
within-set gain directly; and the 3000 vs 1000 comparison of the staged
selector against the shipped one at equal rated count. Reproduce: the command
above, with `NOISY_OUT` set.

### Correction: the fixed set does not improve either (2026-11-04)

The "Not done" item above, run: the same test now also scores the items rated
at the first checkpoint (113 items at 500 answers, a fixed set) at every later
checkpoint (`NOISY_CHECKPOINTS` output gains `fixed-set (n)`). Clean, 1000
items, 3 respondents, 588 s, same seeds, through the real routes and local
Postgres 16. Mean of the 3 respondents:

| answers | rated items | Spearman, all rated | Spearman, fixed 113 items |
|---|---|---|---|
| 500 | 113 | 0.799 | 0.799 |
| 1000 | 213 | 0.615 | 0.719 |
| 1500 | 313 | 0.492 | 0.665 |
| 2000 | 413 | 0.403 | 0.616 |
| 3000 | 613 | 0.538 | 0.715 |

Reading: **the coverage explanation above was only half right.** Widening the
set does explain part of the fall (the all-rated column falls further than the
fixed one), but the fixed set itself scores *lower* at 1000 to 2000 answers
than at 500, by 0.08 to 0.18, with no lapse in the respondent (a noiseless
answerer). More answers about the same 113 items should not make their order
worse. Per respondent the pattern repeats (e.g. 0.818, 0.739, 0.690, 0.611,
0.713), so it is not seed noise. Candidate causes, not tested: the staged
selector spends later answers pairing the fixed items with new, high-RD items,
and the Glicko update moves well-placed items on comparisons against
poorly-placed ones; or the pair choice, once the set is "settled", prefers
near ties whose noiseless answers are decided by tiny true gaps. Next: the
same fixed-set score with `pairSelector` set to the shipped selector, to see
whether the dip belongs to the staged selector or to the rating update.
Reproduce: `NOISY_ITEMS=1000 NOISY_ANSWERS=3000 NOISY_RESPONDENTS=3
NOISY_CONDITIONS=clean NOISY_CHECKPOINTS=500,1000,1500,2000,3000
NOISY_TIMEOUT_MS=7000000 NOISY_OUT=/tmp/o.txt npx vitest run -c
vitest.integration.config.ts src/app/api/trials/noisyRespondents`.

### The dip belongs to the staged selector (2026-11-05)

The "Next" item above, run: `NOISY_SELECTOR=standard` (new) sets the survey's
`pairSelector` to the shipped selector, everything else the same (clean
respondent, 1000 items, 3 respondents x 3000 answers, real routes, local
Postgres 16, 304 s). The fixed set is the items rated at 500 answers (107 to
109 here; the shipped selector rates slightly different items). Mean of the 3:

| answers | rated items | Spearman, all rated | Spearman, fixed set |
|---|---|---|---|
| 500 | 108 | 0.711 | 0.711 |
| 1000 | 205 | 0.621 | 0.801 |
| 1500 | 296 | 0.600 | 0.795 |
| 2000 | 395 | 0.576 | 0.786 |
| 3000 | 588 | 0.557 | 0.770 |

Reading: with the shipped selector the fixed set **improves** from 500 to 1000
answers (0.71 to 0.80) and then holds (0.77 to 0.80); it does not fall the way
the staged selector's did (0.80, 0.72, 0.67, 0.62, 0.72). So the fixed-set dip
is a property of the staged selector, not of the rating update. The all-rated
column falls for both, as the set widens (coverage). Caveats: 3 respondents,
one seed family; the shipped selector starts lower at 500 answers (0.71 vs
0.80), so staged is ahead early and behind by 1000; the table does not say
which is better for a real survey (staged was chosen on settled items kept at
300 answers, a different measure). Next: find why the staged selector's later
pairs hurt settled items (candidates above: pairing settled items with new
high-RD items; near-tie pairs), e.g. log the pair mix per 500 answers, then
test a variant that stops pairing settled items with unrated ones.
Reproduce: the command above with `NOISY_SELECTOR=standard`.

### Pair mix of the staged selector, in process: no dip reproduced (2026-11-05)

The "Next" item above, first half: `src/lib/pairMix.simulation.test.ts` (new; no
database, 1000 items, 3000 answers, clean respondent, seeds 11 to 13, mean of
3, about 170 s) logs, per 500 answers, the share of served pairs that are
settled+settled (`ss`, both rd < 150), settled+open (`so`), open+open (`oo`),
the share touching an unseen item, the mean true gap of the pair, and the
Spearman over the items rated at 500 answers (fixed set).

| selector | answers | rated | all rated | fixed set | ss | so | oo | unseen | gap |
|---|---|---|---|---|---|---|---|---|---|
| staged | 500 | 113 | 0.788 | 0.788 | 0.00 | 0.46 | 0.54 | 0.22 | 0.51 |
| staged | 1000 | 213 | 0.807 | 0.804 | 0.00 | 0.80 | 0.20 | 0.20 | 0.48 |
| staged | 2000 | 413 | 0.816 | 0.809 | 0.00 | 0.80 | 0.20 | 0.20 | 0.49 |
| staged | 3000 | 613 | 0.818 | 0.811 | 0.00 | 0.80 | 0.20 | 0.20 | 0.51 |
| shipped | 500 | 108 | 0.741 | 0.741 | 0.08 | 0.39 | 0.54 | 0.20 | 0.59 |
| shipped | 1000 | 206 | 0.769 | 0.832 | 0.10 | 0.51 | 0.39 | 0.18 | 0.62 |
| shipped | 2000 | 393 | 0.773 | 0.870 | 0.12 | 0.49 | 0.39 | 0.17 | 0.62 |
| shipped | 3000 | 587 | 0.769 | 0.880 | 0.11 | 0.48 | 0.41 | 0.18 | 0.61 |

Reading: (1) **the dip does not appear here.** The staged fixed set holds at
0.79 to 0.81 and the all-rated score at 0.81 to 0.82, where the route runs gave
0.80, 0.72, 0.67, 0.62, 0.72 and 0.62 to 0.50. So the dip is not a property of
the pair-picking function with a plain Glicko-2 loop on one respondent; look
at what the route adds (several respondents pooled, stored ratings and RD
drift between sessions, repeat-pair and recency rules, how `rd` reaches the
selector). (2) What the staged selector does serve: **never** two settled items
(0.00 against the shipped 0.08 to 0.12), 80% settled-with-open after 500
answers, steady 20% pairs with an unseen item, and a smaller true gap (0.48 to
0.51 against 0.61), i.e. closer matches. The shipped selector keeps more
settled+settled pairs and its fixed set climbs to 0.88; staged is higher on all
rated items (0.82 against 0.77) because it widens coverage faster. (3) The
route's absolute numbers are below this loop's for both selectors (shipped
fixed set 0.77 to 0.80 against 0.83 to 0.88), so the gap between route and
simulation exists for the shipped selector too. Caveats: 3 seeds, the sim's
`rd` is the in-memory Glicko state, one respondent. Next: run the same
selector inside the route's per-respondent loop with pooled ratings (no
Postgres needed if the pooling function is called directly) to find which
route step adds the dip; the settled+settled-free mix is the first suspect
only if the route's settled items lose pairs they would have had.
Reproduce: `MEASURE_OUT=out.txt npx vitest run -c vitest.simulations.config.ts
src/lib/pairMix.simulation.test.ts`.

### Noiseless answerer in process: still no dip (2026-11-06)

The route tests answer noiselessly (the item listed first always wins); the
in-process loop above sampled a logistic answer. `pairMix.simulation.test.ts`
now takes `MIX_ANSWERER=noiseless` (the higher true value always wins), same
1000 items, 3000 answers, seeds 11 to 13, plain Glicko-2 loop, 500-answer steps
(2500 added). Fixed set, mean of 3:

| selector | 500 | 1000 | 1500 | 2000 | 2500 | 3000 |
|---|---|---|---|---|---|---|
| staged | 0.978 | 0.981 | 0.981 | 0.979 | 0.979 | 0.978 |
| shipped | 0.921 | 0.969 | 0.974 | 0.976 | 0.978 | 0.978 |

Reading: **the answerer is not the cause.** With deterministic answers the
staged fixed set holds at 0.98 (route runs: 0.80, 0.72, 0.67, 0.62, 0.72), and
the pair mix is the same as before (no settled+settled pairs, 80% settled+open,
20% unseen). It also ranks far higher than the route does for both selectors,
so the loop and the route differ in something else. Left to test, each one
change at a time in the loop: how `recentPairKeys` and `timesShown` are built
from stored trials (the route reads the latest 10 by `shownAt`, ties at one
millisecond are unordered), `rd` and `volatility` read back from the database
(`loadRatedItems`), and the A/B slot shuffle. Caveats: 3 seeds, one
respondent, hand-run; the route numbers are from 2026-11-04/05.
Reproduce: `MIX_ANSWERER=noiseless MEASURE_OUT=out.txt npx vitest run -c
vitest.simulations.config.ts src/lib/pairMix.simulation.test.ts`.

### Route-style call in the loop: still no dip (2026-11-08)

`pairMix.simulation.test.ts` takes `MIX_ROUTE=1` (and `MIX_SELECTOR=staged|shipped`
to run one selector). It makes the loop's call match `/api/trials/next`: no
injected `rand` (the selector falls back to `Math.random`), `firstOptionShare`
passed only after 30 decided answers and measured on the slot-A share, and a
random A/B slot shuffle before the answer. Noiseless answerer, staged, 1000
items, seeds 11 to 13, fixed set at 500 / 1000 / 1500 / 2000 / 2500 / 3000
answers:

| loop | 500 | 1000 | 1500 | 2000 | 2500 | 3000 |
|---|---|---|---|---|---|---|
| plain | 0.978 | 0.981 | 0.981 | 0.979 | 0.979 | 0.978 |
| route-style call | 0.979 | 0.983 | 0.983 | 0.982 | 0.982 | 0.981 |

Reading: **the slot shuffle, the default RNG and the first-option gate are not
the cause.** `ParticipantItemRating.rating/rd/volatility` are `Float` (Postgres
double precision), so reading `rd` back from the database loses nothing either.
Left to test: how `recentPairKeys` is built from stored trials (latest 10 by
`shownAt`, ties at one millisecond unordered), `timesShown` from the
`groupBy` (counts unanswered rows too), and item order out of `findMany`
(unordered; the route test's cuids rise with the true order, which the loop's
random truth does not copy). Those need Postgres or a stub of the three reads.
Caveats: 3 seeds, one respondent, hand-run, clean answerer.
Reproduce: `MIX_ROUTE=1 MIX_ANSWERER=noiseless MIX_SELECTOR=staged MEASURE_OUT=out.txt
npx vitest run -c vitest.simulations.config.ts src/lib/pairMix.simulation.test.ts`.

### Found: the dip came from admitting items in id order (2026-11-08)

`pairMix.simulation.test.ts` takes `MIX_TRUTH_ORDER=1`: the hidden value falls with
the item's position (item-0000 best), as in the route tests (lower sortOrder wins),
instead of the loop's random truth. Route-style call, noiseless, staged, 1000 items,
seeds 11 to 13, fixed set at 500 / 1000 / 1500 / 2000 / 2500 / 3000 answers:

| truth | 500 | 1000 | 1500 | 2000 | 2500 | 3000 |
|---|---|---|---|---|---|---|
| random (before) | 0.975 | 0.976 | 0.976 | 0.975 | 0.973 | 0.973 |
| in id order (before) | 0.821 | 0.745 | 0.666 | 0.617 | 0.658 | 0.709 |
| in id order, hash admission | 0.981 | 0.982 | 0.984 | 0.985 | 0.985 | 0.985 |

The route's dip reproduces with no database, so it was not the route's reads
(recent pairs, times shown, item order out of `findMany`): it was `admissionOrder`,
which admitted items alphabetically by id inside each category. When ids follow
a meaningful order (cuids rise with creation; an author who lists items by price,
date or quality creates them in that order) the first stages saw a slice of the
range, not a spread, and the rating of that slice degraded as the window grew.
`admissionOrder` now sorts by a hash of the id (`admissionHash`: FNV-1a with a
murmur finalizer; the first try, FNV-1a alone, clustered near-identical ids and
only reached 0.92). Same id, same place, so the set still only grows. Unit
tests: `pairing.test.ts`, "admissionOrder". The fast suite passes (300 tests).
Caveats: noiseless answerer, 3 seeds, one respondent, hand-run; the live-Postgres
`noisyRespondents` run was not repeated here (needs `scripts/test-db.sh start`).
Reproduce: `MIX_TRUTH_ORDER=1 MIX_ROUTE=1 MIX_ANSWERER=noiseless MIX_SELECTOR=staged
MEASURE_OUT=out.txt npx vitest run -c vitest.simulations.config.ts src/lib/pairMix.simulation.test.ts`.

### The fix holds through the real routes, live Postgres (2026-11-08)

The "Next" item above, run: `NOISY_ITEMS=1000 NOISY_ANSWERS=3000
NOISY_RESPONDENTS=3 NOISY_CONDITIONS=clean NOISY_CHECKPOINTS=500,1000,1500,2000,3000`
through `noisyRespondents.integration.test.ts` (real routes, local Postgres 16
from `scripts/test-db.sh start`, 638 s, test passed). Fixed set = the 113 items
rated at 500 answers. Spearman of the fixed set, per respondent at 500 / 1000 /
1500 / 2000 / 3000 answers:

| respondent | 500 | 1000 | 1500 | 2000 | 3000 |
|---|---|---|---|---|---|
| 0 | 0.973 | 0.981 | 0.982 | 0.983 | 0.982 |
| 1 | 0.977 | 0.984 | 0.984 | 0.984 | 0.982 |
| 2 | 0.977 | 0.976 | 0.978 | 0.977 | 0.979 |

Mean at 3000 answers: 0.981 (all 613 rated items 0.979; top-slot share 0.51).
Before the hash admission the same run gave 0.62 to 0.71 at 3000. The dip is
gone through the routes, not only in process. Caveats: noiseless answerer, 3
respondents, one run, one item count (1000).

### A lapsing answerer through the real routes at 3000 answers (2026-11-09)

The other half of the 2026-11-08 "Next": `NOISY_ITEMS=1000 NOISY_ANSWERS=3000
NOISY_RESPONDENTS=3 NOISY_CONDITIONS=lapse20 NOISY_CHECKPOINTS=500,1000,1500,2000,3000`
through `noisyRespondents.integration.test.ts` (real routes, local Postgres 16
from `scripts/test-db.sh start`, 664 s, test passed). A lapse is a random answer
in place of the true one, 20% of the time. Fixed set = the 113 items rated at 500
answers. Spearman of the fixed set, per respondent at 500 / 1000 / 1500 / 2000 / 3000:

| respondent | 500 | 1000 | 1500 | 2000 | 3000 |
|---|---|---|---|---|---|
| 0 | 0.924 | 0.938 | 0.936 | 0.938 | 0.941 |
| 1 | 0.936 | 0.948 | 0.950 | 0.952 | 0.946 |
| 2 | 0.935 | 0.948 | 0.948 | 0.953 | 0.952 |

Mean over all 613 rated items at 3000 answers: 0.938 (top-slot share 0.50).
There is no dip: the fixed set rises from about 0.93 to about 0.95 and stays
there, so the hash admission holds for a person who lapses, at about 0.04 below
the noiseless 0.981, which is what a 20% lapse costs. Caveats: 3 respondents, one
run, one item count (1000), lapse rate 20% only, a lapse that is uniform random
(not a tired person whose lapses cluster late in the session).

### Lapses that start late in a session (2026-11-09)

The other open "Next" item: a respondent who answers well, then tires. Condition
`lapselate` (new in `noisyRespondents.integration.test.ts`): no lapses for the
first 2000 answers, then a random answer 50% of the time. Run:
`NOISY_ITEMS=1000 NOISY_ANSWERS=3000 NOISY_RESPONDENTS=3 NOISY_CONDITIONS=lapselate
NOISY_CHECKPOINTS=500,1000,1500,2000,2500,3000` through the real routes and local
Postgres 16 (643 s, test passed). Fixed set = the 113 items rated at 500 answers.

| respondent | all items @2000 | all items @2500 | all items @3000 | fixed set @2000 | fixed set @3000 |
|---|---|---|---|---|---|
| 0 | 0.979 | 0.920 | 0.886 | 0.984 | 0.984 |
| 1 | 0.983 | 0.930 | 0.886 | 0.985 | 0.983 |
| 2 | 0.983 | 0.937 | 0.895 | 0.981 | 0.980 |

Mean over all 613 rated items at 3000 answers: 0.889 (top-slot share 0.50).

Reading: items settled before the fatigue are not damaged (fixed set stays
0.98). The fall in the all-items score is the 200 items first admitted after
answer 2000, which only ever see answers that are half random; they sit lower
than the 0.924-0.953 of a respondent who lapses throughout, because they have no
clean answers to lean on. The selector does not slow down or stop admitting new
items when answers turn noisy. Untried: a stop or "answers look random" signal
(for example a run of answers that disagree with the current ordering) that
pauses admission. Not measured: a real respondent's fatigue curve.

## An "answers look random" pause: measured, not wired in (2026-11-09)

The untried signal above, built and measured. `answerAgreement` (in
`src/lib/pairing.ts`) scores the last 80 decided answers on the ratings a trial
row stores BEFORE each answer: observed picks of the favoured item minus the
Glicko-expected number, as a z-score. `activeItems` takes an `admissionPaused`
flag that holds the window at the core set plus items already shown.

Two things failed first. Scoring against the ratings fitted afterwards gave a
random respondent 0.87 to 0.92 agreement (each answer has just moved its own
pair). A raw agreement share before the answer does not separate them either:
the selector pairs close items on purpose, so an honest respondent agrees 0.53
to 0.58 of the time and a random one 0.4 to 0.63.

The z-score is better but not usable
(`admissionPause.simulation.test.ts`, 120 items, staged hybrid, 6 seeds, every
25th answer from 120 to 500):

| respondent | mean z | sd | share of readings below -2 |
|---|---|---|---|
| honest | -0.53 | 0.97 | 0.07 |
| 20% lapses | -0.83 | 1.32 | 0.20 |
| fully random | -1.16 | 1.21 | 0.22 |

Random answering is caught 22% of the time and an honest respondent is paused
7% of the time. The mean sits below zero even for honest answers, because
Glicko ratings are overconfident early. So the route is unchanged: no pause
ships. The function and flag stay, unwired, so the result can be reproduced.
What might work: a respondent-level repeat-pair consistency test (re-ask an
earlier pair and compare), which does not depend on the rating scale.

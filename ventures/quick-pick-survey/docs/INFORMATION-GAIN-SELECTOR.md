# Information-gain pair selector (the default up to 120 items since 2026-11-12)

`selectNextPairByInformation` in `src/lib/pairing.ts` picks the pair whose one
answer is expected to shrink the two items' rating variance most under the
Glicko model (`expectedVarianceReduction`: Fisher information
`g(phi_opp)^2 p(1-p)` per side). The shipped `selectNextPair` stays the app's
policy for lists over 120 items; since 2026-11-12 the staged selector (this
one from the first answer) is the server default up to 120 items ("Staged as
the default up to 120 items", the last section).

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
`/api/trials/next` use `selectNextPairHybrid`, and `PAIR_SELECTOR=standard`
the shipped selector, on every survey that has not chosen. Unset, since
2026-11-12, a survey of up to 120 items gets staged and a longer one standard
(`defaultPairSelector`, `resolvePairSelector` in `pairing.ts`); before that,
unset meant standard everywhere. Any other value is ignored with a warning in
the log, not read as either.

## Choosing it per survey

`Survey.pairSelector` (migration `20261021000000_survey_pair_selector`) is
`null`, `"standard"` or `"staged"`. `POST /api/admin/surveys` accepts it as
`pairSelector`, and the admin form has a "Question order" menu. `/api/trials/next`
uses the survey's value when set, otherwise the `PAIR_SELECTOR` environment
variable, otherwise the length default above. A survey that never chose, on a
deployment with the variable unset, moved to staged on 2026-11-12 if it has
120 items or fewer; set its menu to Standard to keep the old order. `staged` helps
long lists answered at length (see above). Since 2026-11-10 it uses the
information selector from the first answer on lists up to 120 items ("A
switch point that depends on list length", below); before that it equalled
the standard selector for the first 120 answers whatever the list length.

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

### Per-item terms (2026-11-12)

The pair loop used to build a sorted key string for every pair and recompute
terms that depend on one item only. It now computes those once per item and
builds a key only when both ids occur in a recent key. The scores and the pair are
unchanged (`src/lib/pairingInformationParity.test.ts` pins them against the
old form), and the simulation MEASURE output is byte-identical. Selector compute
by `pairLatency.test.ts`, median of 15 calls:

| items | answers | information | staged |
|---|---|---|---|
| 220 | 300 | 10.4 to 4.1 ms | 9.7 to 4.0 ms |
| 500 | 300 | 32.9 to 12.8 ms | 49.5 to 10.0 ms |

The simulation suite went from 630 s to 151 s
(`docs/history/ci-perf-2026-11-12-qps-information-selector-loop.md` at the
repository root).

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

> **Superseded (2026-11-11):** this table and the two fallback tables below
> ran without the route's slot shuffle and overstate the harm of position bias
> about fourfold. Read "Position bias behind the slot shuffle" at the end of
> this file instead.

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

## A repeat-pair probe for fatigue: measured, not worth building (2026-11-09)

The next idea after the rating-based pause: re-ask a pair the respondent
already answered and compare. A repeat agrees with the first answer with
probability q^2 + (1-q)^2, where q is the chance the first option is picked.
That is 1.0 for a lopsided pair and 0.5 for a coin flip, and the selector
shows close pairs on purpose.

`src/lib/repeatProbe.simulation.test.ts` takes the pairs the staged hybrid
really shows (answers 120 to 500, 120 items, 6 seeds, 2280 pairs) and computes
the expected agreement from the simulator's true strengths. The repeats needed
are for a one-sided 5% z test with 80% power.

| pairs repeated | honest | 20% lapses | random | repeats to tell honest from 20% lapses | from random |
|---|---|---|---|---|---|
| the hybrid's own pairs | 0.614 | 0.573 | 0.500 | 3549 | 465 |
| uniformly drawn pairs | 0.673 | 0.610 | 0.500 | 1467 | 195 |
| a lopsided catch pair (win chance 0.97) | 0.942 | 0.783 | 0.500 | 103 | 18 |

Repeating the selector's own pairs cannot work: honest agreement is only 0.61,
so a respondent would need to answer thousands of repeats. A deliberately
lopsided catch pair (top against bottom of the current ordering) separates
random answering in about 18 repeats, and a 20% lapser in about 100. Each
repeat is a wasted answer for ranking, so a real design would spend about
5% of answers on them and would only help for long sessions. Not built: it
adds respondent burden for a rare failure, and the rank-accuracy cost of lapses
up to 20% was already small (see the lapse sweep above). Not measured: a real
respondent's fatigue curve. `simulate` now also returns the true strengths.

## A switch point that depends on list length (2026-11-10)

The staged selector ran the shipped selector for the first 120 answers on
every list. On a 15-item list a respondent rarely answers 120 pairs, so they
never reached the information selector, which beat the shipped one on real
people's rankings in all 25 cells (REAL-RANKINGS.md). The 120 had been chosen
on 41 and 220 items against "items under rd 150", described as the couple
screen's bar. **The couple screen's bar is not rd 150.** `couples.ts` needs
`MIN_ITEMS_FOR_CROSS_PERSON` (8) items under `CONFIDENT_RD` (200) in each
person's ranking before it compares two people. So this run measured that bar.

`scripts/couple-bar-sweep.ts` (synthetic respondent of `infoGainSim.ts`, 30
seeds per row, no lapse): the answer count at which a respondent first has 8
items under rd 200 (median / 90th percentile), and mean rank accuracy at 2, 4
and 8 answers per item. "by length" is the new default.

| items | shipped | information | staged @120 | staged by length (@0) | rank at 2n: shipped / by length | 4n | 8n |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 8 | 26 / 36 | 19 / 20 | 26 / 36 | 19 / 20 | 0.603 / 0.691 | 0.781 / 0.817 | 0.869 / 0.890 |
| 11 | 29 / 31 | 21 / 21 | 29 / 31 | 21 / 21 | 0.582 / 0.640 | 0.747 / 0.738 | 0.864 / 0.868 |
| 15 | 34 / 38 | 27 / 27 | 34 / 38 | 27 / 27 | 0.604 / 0.726 | 0.754 / 0.826 | 0.858 / 0.897 |
| 20 | 40 / 44 | 34 / 34 | 40 / 44 | 34 / 34 | 0.669 / 0.705 | 0.776 / 0.825 | 0.879 / 0.885 |
| 30 | 39 / 44 | 35 / 35 | 39 / 44 | 35 / 35 | 0.638 / 0.662 | 0.781 / 0.820 | 0.884 / 0.896 |
| 41 | 39 / 45 | 35 / 35 | 39 / 45 | 35 / 36 | 0.557 / 0.631 | 0.771 / 0.814 | 0.880 / 0.893 |
| 60 | 38 / 44 | 35 / 36 | 38 / 44 | 35 / 36 | 0.516 / 0.567 | 0.756 / 0.805 | 0.876 / 0.889 |
| 80 | 40 / 44 | 35 / 36 | 40 / 44 | 35 / 36 | 0.495 / 0.530 | 0.740 / 0.798 | 0.876 / 0.897 |
| 120 | 40 / 45 | 35 / 36 | 40 / 45 | 35 / 36 | 0.462 / 0.507 | 0.719 / 0.785 | 0.878 / 0.894 |

What it shows:

- **The information selector reaches the couple bar 4 to 8 answers sooner at
  every length, and more predictably** (p90 within one answer of the median,
  against 5 to 10 answers later for shipped). It spreads early answers over
  items it is unsure of, and 8 items under rd 200 needs breadth, not depth.
- **It ranks better at every length and budget measured but one**, 11 items at
  4n (0.738 against 0.747, inside seed noise).
- **Where the shipped selector still wins: items under rd 150 on long lists
  answered briefly.** `scripts/switch-point-sweep.ts` (20 to 40 seeds) has the
  shipped selector ahead on rd 150 while answers are below about three per item:
  41 items at 82 to 90 answers, 3.6 to 4.5 items against 0.5 to 0.9. Above that
  the information selector is far ahead (41 items at 164 answers: 40.8 against
  17.1). No screen uses rd 150, so this run does not weigh it.
- **Switching part way costs both.** The same sweep shows a hand-over in the
  middle of a session dropping items under rd 150 below either pure selector
  (60 items, 180 answers: 9.3 at a switch of 120, 18.2 shipped, 40.8
  information): the information selector starts on items the shipped one left
  half settled. That is a second reason to pick one selector per list rather
  than switch.

**Decision.** `hybridSwitchAt(itemCount)` returns 0 for lists up to
`INFO_FROM_START_MAX_ITEMS` (120) and 120 above, and `selectNextPairHybrid`
uses it unless a caller passes `switchAt`. The first-option fallback is
unchanged: after 30 decided answers (`FIRST_OPTION_MIN_DECIDED`, now exported
and used by both the route and the simulator), a share at or beyond 0.7 still
gets the shipped selector. Lists over 120 items keep the 120-answer switch
because they were not measured here.

**Simulator change.** `infoGainSim.ts` passed the first-option share from the
first answer, while the route waits for 30. With a switch at 120 that never
mattered; with a switch at 0 a chance share of 0.7 after three answers flipped
the simulated respondent to the shipped selector and cost 0.02 rank at 41
items and 300 answers. The simulator now waits for 30 answers, as the route
does. No earlier table changes: they all switched at 120 or later.

**On real people** (`scripts/real-rankings-eval.ts --seeds 200`, which now
prints a `staged` row): staged equals the information row in all 25 cells
(breakfast 15 items, T-shirts 11), so it is at least the shipped selector's
Spearman against a new crowd in every cell (+0.00 to +0.06) and picks the
crowd's favourite more often in 21 of 25 (the same in 1, less often in 3).

**Not tested, and the known cost.** (Measured 2026-11-11, next section: mostly
seed noise, and no fallback ships.) Heavy careless answering: with 35% to 50%
of answers at random, the information selector trailed the shipped one on 15
and 30 items by up to 0.06 rank (30 seeds; it was ahead on 8, 11 and 20 items
and at 10% lapse everywhere). The staged selector has no fallback for that,
only for position bias; the "answers look random" signal measured on
2026-11-09 is the candidate. Lists over 120 items, real pairwise answers and a
couple screen opened by two real people are also untested.

Tests: `pairing.test.ts` (the rule, and the 15-item and 200-item pairs; both
fail with the old fixed switch), `infoGainPairing.simulation.test.ts` (the
couple bar at 11 and 41 items; the rd 150 assertion now holds only where the
rule still switches at 120 or at 300 answers).


## A careless-answer fallback for the staged selector: measured, not shipped (2026-11-11)

The 2026-11-10 section above left one known cost: with 35% to 50% of answers
given at random, the information selector trailed the shipped one on 15 and 30
items by up to 0.06 rank, and the staged selector (information from the first
answer up to 120 items) had no fallback for it. The candidate was the
2026-11-09 "answers look random" score (`answerAgreement`, last 80 decided
answers scored on the ratings stored before each answer).

`scripts/careless-fallback-sweep.ts` (synthetic respondent of `infoGainSim.ts`;
8, 11, 15, 20 and 30 items; lapse 0, 0.1, 0.2, 0.35 and 0.5; 2, 4 and 8
answers per item; 75 cells). Policies: shipped, information, staged, and staged
with a fallback that hands the pair to the shipped selector while the z-score is
below -2, -1.5 or -1 (and sticky variants that stay there once it trips). The
score goes to the fallback rule only, so the information selector's admission
pause stays off, as in the route. Two rules that need no detection were added
for the second run: a fixed 25% or 50% of answers always from the shipped
selector.

Run 1 chose what to keep (30 seeds, seed base 1000, every policy). Run 2
checked it on 60 fresh respondents (seed base 50000, `--policies 'shipped;staged;staged, z<-2 sticky;staged, 25% shipped;staged, 50% shipped'`).
Run 2, over the 75 cells:

| policy | mean rank vs staged | worst cell vs staged | cells behind shipped by > 0.02 |
|---|---:|---:|---:|
| shipped | -0.014 | -0.060 | 0 |
| staged (as shipped today) | 0 | 0 | 7 |
| staged, fallback at z < -2, sticky | -0.002 | -0.025 | 7 |
| staged, 25% of answers shipped | -0.007 | -0.084 | 16 |
| staged, 50% of answers shipped | -0.004 | -0.065 | 10 |

Share of runs in which the sticky z < -2 fallback tripped by 8 answers per item
(run 2): honest respondents (lapse 0) 0.18, 0.15, 0.32, 0.33 and 0.40 at 8, 11,
15, 20 and 30 items; half-random respondents (lapse 0.5) 0.53, 0.43, 0.43, 0.35
and 0.57. Under 40 answers it cannot trip (`AGREEMENT_MIN_DECIDED`), and on a
short list that is most of the session.

What it shows:

- **The cost being fixed is mostly seed noise.** Of the cells where staged
  trailed shipped by more than 0.02 in either run, only two trailed in both:
  11 items at lapse 0.5 and 8 answers per item (-0.084, then -0.031) and 30
  items at lapse 0.5 and 8 per item (-0.045, then -0.025). The 0.06 quoted
  before came from one seed set; 11 items at lapse 0.5 read -0.066 to -0.084 on
  run 1 and -0.002 to -0.031 on run 2. Across all 75 cells staged is ahead of
  shipped by 0.021 (run 1) and 0.014 (run 2), including most heavy-lapse cells.
- **The score cannot tell careless from careful.** It trips for a third of
  honest respondents on 15 to 30 items and for about half of half-random ones,
  so a fallback on it swaps selectors almost at random. It moved the mean by
  -0.002 and left the same 7 cells behind shipped.
- **A fixed share of shipped pairs costs more than it saves.** Both mixes gain
  in some heavy-lapse cells (+0.10 at 8 items, lapse 0.2, 2 per item) and lose
  more elsewhere, including on honest respondents (-0.065 at 8 items, 4 per
  item).

**Decision.** The staged selector stays as it is: no careless-answer fallback.
`answerAgreement` stays unwired. The two cells that trail on both runs are at
50% random answers, where every selector's ranking is poor (0.59 to 0.65 at 8
answers per item on run 2, against 0.84 to 0.89 for an honest respondent).

**What might work instead** (tried the same day: next section, "A Glicko update with a lapse term"): fix the cause, not the selector. Both
selectors share a Glicko update that treats every answer as true preference, so
a random answer tightens rd as much as a careful one. An update with a lapse term
(win probability e/2 + (1 - e) p) would keep rd honest under careless
answering for both selectors. It changes every stored rating, so it needs its
own measurement against the real rankings in REAL-RANKINGS.md first.

Caveats: synthetic respondent, lapses uniform over the session (the late-onset
case is "Lapses that start late in a session" above), lists of 30 items or fewer,
no real pairwise answers.


## A Glicko update with a lapse term: measured, not shipped (2026-11-11)

The section above ended on "fix the cause, not the selector": both selectors
share a Glicko-2 update that treats every answer as a true preference. This
run built that update and measured it.

**The update** (`src/lib/glicko2.ts`, `updateGlicko(..., lapse)` and
`applyComparison(..., lapse)`). With an assumed lapse share e the chance of a
win is q = e/2 + (1 - e) p. Glicko-2's v and delta are the inverse Fisher
information and the score step of the one-game log-likelihood, so with q in
place of p they become info = (dq/dmu)^2 / (q(1 - q)) and step =
(s - q) dq/dmu / (q(1 - q)), with dq/dmu = (1 - e) g p (1 - p). At e = 0 the
old arithmetic runs unchanged (pinned to the bit in `glicko2.test.ts`; the
closed form is checked there against a finite-difference derivative of the
lapse likelihood). The routes still pass 0.

**What it cannot do.** Glicko's rd update depends on the expected information
of a game, not on its outcome. So a fixed e cannot make a careless answer
shrink rd less than a careful one, which was the hope: it shrinks rd less for
*every* answer, and only the rating step (and a little of the volatility
step) treats a surprise differently.

**Synthetic sweep** (`scripts/lapse-update-sweep.ts`; respondent of
`infoGainSim.ts`; 8, 11, 15, 20 and 30 items; true lapse 0, 0.1, 0.2, 0.35 and
0.5; 2, 4 and 8 answers per item; 75 cells; run 1 seeds from 1000, run 2 from
50000, 60 respondents each). `coverage` is a new `simulate` output: the share
of item pairs whose 95% interval on the rating difference
(1.96 sqrt(rd_a^2 + rd_b^2)) holds the true difference. "e = true" gives the
update the respondent's real lapse rate, which the survey cannot know: the
ceiling for this kind of update.

Mean rank accuracy change against the same selector with e = 0, over the 75
cells (run 1 / run 2), and cells better or worse by more than 0.02:

| selector, assumed e | mean change | cells > +0.02 | cells < -0.02 |
|---|---:|---:|---:|
| shipped, 0.05 | +0.009 / +0.003 | 18 / 4 | 0 / 5 |
| shipped, 0.1 | +0.008 / +0.003 | 18 / 11 | 1 / 6 |
| shipped, 0.2 | +0.006 / +0.008 | 15 / 10 | 3 / 1 |
| shipped, true | +0.008 / +0.010 | 18 / 14 | 2 / 1 |
| staged, 0.05 | +0.002 / +0.003 | 4 / 7 | 0 / 1 |
| staged, 0.1 | +0.007 / +0.006 | 13 / 15 | 1 / 3 |
| staged, 0.2 | +0.013 / +0.006 | 21 / 13 | 1 / 4 |
| staged, true | +0.014 / +0.009 | 21 / 15 | 0 / 3 |

95% pairwise coverage by true lapse 0 / 0.1 / 0.2 / 0.35 / 0.5 (run 2; run 1
within 0.01):

| selector, assumed e | coverage |
|---|---|
| shipped, 0 (today) | 0.969 / 0.962 / 0.950 / 0.921 / 0.881 |
| shipped, 0.2 | 0.985 / 0.983 / 0.978 / 0.963 / 0.941 |
| shipped, true | 0.969 / 0.974 / 0.978 / 0.983 / 0.989 |
| staged, 0 (today) | 0.901 / 0.878 / 0.853 / 0.801 / 0.746 |
| staged, 0.1 | 0.927 / 0.907 / 0.886 / 0.846 / 0.794 |
| staged, 0.2 | 0.951 / 0.940 / 0.920 / 0.883 / 0.841 |
| staged, true | 0.901 / 0.907 / 0.920 / 0.941 / 0.967 |

The two cells where staged trailed shipped on both seed sets in the previous
section (lapse 0.5, 8 answers per item; run 1 / run 2): 11 items, shipped
0.645 / 0.644, staged 0.567 / 0.613, staged e = 0.2 0.614 / 0.665, staged
e = true 0.623 / 0.720; 30 items, shipped 0.640 / 0.610, staged 0.608 / 0.585,
staged e = 0.2 0.633 / 0.623, staged e = true 0.666 / 0.672.

**The cost: answers to the couple bar** (`--couple-bar`; median / p90 answers
until min(8, items) items are under rd 200; 40 respondents; the count barely
moves with the true lapse, as the rd argument above predicts, so lapse 0 is
shown):

| items | shipped e 0 | 0.05 | 0.1 | 0.2 | staged e 0 | 0.05 | 0.1 | 0.2 |
|---:|---|---|---|---|---|---|---|---|
| 8 | 26 / 31 | 30 / 37 | 32 / 42 | 48 / 69 | 19 / 20 | 24 / 26 | 24 / 28 | 35 / 41 |
| 15 | 34 / 38 | 38 / 42 | 42 / 47 | 57 / 64 | 27 / 27 | 33 / 34 | 34 / 35 | 42 / 42 |
| 30 | 39 / 44 | 46 / 53 | 57 / 64 | 83 / 94 | 35 / 35 | 45 / 46 | 50 / 50 | 74 / 77 |

**Real people's rankings** (`scripts/real-rankings-eval.ts --seeds 200
--selectors shipped,staged --lapse L --update-lapse e`, new flags; PrefLib
breakfast and T-shirt panels, all 25 cells; the e = 0 rows reproduce
REAL-RANKINGS.md). Means over the 25 cells:

| true lapse | selector, assumed e | Spearman vs others | top pick right | rank range holds | range width | pairs ordered | ordered wrong |
|---:|---|---:|---:|---:|---:|---:|---:|
| 0 | shipped, 0 | 0.696 | 31.2% | 99.4% | 12.07 | 12.4% | 2.00% |
| 0 | shipped, 0.1 | 0.696 | 32.1% | 99.5% | 12.24 | 11.0% | 1.80% |
| 0 | shipped, 0.2 | 0.695 | 31.7% | 99.6% | 12.42 | 9.5% | 1.40% |
| 0 | staged, 0 | 0.716 | 34.8% | 99.2% | 11.88 | 13.9% | 1.92% |
| 0 | staged, 0.1 | 0.715 | 35.3% | 99.3% | 12.06 | 12.4% | 1.56% |
| 0 | staged, 0.2 | 0.715 | 35.2% | 99.4% | 12.27 | 10.6% | 1.28% |
| 0.1 | shipped, 0 | 0.677 | 30.4% | 99.5% | 12.30 | 10.6% | 2.00% |
| 0.1 | shipped, 0.1 | 0.677 | 31.2% | 99.5% | 12.43 | 9.4% | 1.60% |
| 0.1 | shipped, 0.2 | 0.676 | 31.4% | 99.7% | 12.61 | 7.8% | 1.32% |
| 0.1 | staged, 0 | 0.697 | 34.4% | 99.3% | 12.05 | 12.6% | 1.80% |
| 0.1 | staged, 0.1 | 0.696 | 34.3% | 99.3% | 12.19 | 11.2% | 1.68% |
| 0.1 | staged, 0.2 | 0.696 | 34.6% | 99.5% | 12.40 | 9.6% | 1.24% |

Spearman moves by at most 0.01 in any cell (mean -0.001 to 0.000); the pooled
report's rank ranges already hold 99%+, so the lapse term only makes it more
cautious: at e = 0.2 it confidently orders about a quarter fewer pairs (13.9%
to 10.6% for staged, honest panel) and gets about a third fewer of those
wrong (1.92% to 1.28%).

**Decision.** The routes keep e = 0. A fixed e is a uniform discount, not a
careless-answer detector: it buys 0.002 to 0.014 of mean rank accuracy and better
coverage on synthetic respondents, at 15% to 115% more answers (e 0.05 to 0.2) before the
couple screen can speak, and on real people's rankings it trades confidently
ordered pairs for fewer wrong ones in a report whose ranges already hold
99%+. The update stays in `glicko2.ts` as an option, off, with the sweep.

**What it does show.** With the respondent's real lapse rate the update is
calibrated at every lapse (coverage 0.90 to 0.97 for staged, 0.97 to 0.99 for
shipped) and lifts staged above shipped in both heavy-lapse cells that had
trailed. So the next step is a per-respondent estimate of e (for example a
grid posterior over e from the respondent's own answer likelihood, refit as
answers arrive), measured on this sweep against the e = true ceiling before
it touches stored ratings. Separately, staged's coverage is 0.90 even for an
honest respondent (shipped 0.97): the information selector's close pairs make
the single-game rd shrink too fast, a calibration gap in today's per-person
rd that no lapse term fixes.

Caveats: synthetic respondent with uniform lapses; lists of 30 items or fewer;
the real rankings are complete orders answered without noise unless `--lapse`
adds it; no real pairwise answers.


## A per-respondent lapse estimate: measured, not shipped (2026-11-11)

The section above named the next step: estimate e for each respondent from
their own answers, and measure it against the e = true ceiling. Built and
measured the same day; the answer is that a respondent's answers do not carry
enough about e at survey lengths, and the adaptive selectors make it worse.

**The estimator** (`src/lib/lapseEstimate.ts`, unit tests in
`lapseEstimate.test.ts`). A grid posterior over e in 0, 0.025, ..., 0.9 with a
Beta(1, b) prior (b = 19, mean 0.05): each answer adds
log(e/2 + (1 - e) p), where p is the chance the picked item wins. Three ways
to get p, all in `scripts/lapse-update-sweep.ts` (`--assumed est...`):
in-sample (current ratings with rd folded in through Glicko's g, suffix
`-in`), prequential (the ratings just before the answer was applied, rd
folded in; the default `est`), and prequential on point ratings (`-point`,
rd ignored). `simulate` takes the estimate as `updateLapse` (a function now,
as well as a number) and re-reads it before every answer. An `-oracle`
suffix scores each answer with the respondent's true win chance instead: the
most any estimator of this kind could know.

**Final estimate of e, mean and 10th-90th percentile over 20 respondents**
(`--estimates`; 8 and 30 items, 2 and 8 answers per item; uniform prior
`est-b1` unless noted, so the data, not the prior, has to move it):

| setup | true e 0 | 0.1 | 0.2 | 0.35 | 0.5 |
|---|---|---|---|---|---|
| staged, prequential, 30 items x 8 | 0.45 (0.36-0.58) | 0.44 | 0.48 | 0.45 | 0.46 (0.36-0.59) |
| shipped, point ratings, 30 x 8, prior b=19 | 0.15 (0.09-0.22) | 0.21 | 0.26 | 0.34 | 0.40 (0.35-0.45) |
| shipped, oracle, 30 x 8 | 0.06 (0.03-0.12) | 0.14 | 0.20 | 0.40 | 0.54 (0.33-0.67) |
| shipped, oracle, 8 x 2 | 0.35 (0.20-0.53) | 0.33 | 0.37 | 0.40 | 0.45 (0.26-0.70) |
| staged, oracle, 8 x 8 | 0.20 (0.13-0.35) | 0.21 | 0.27 | 0.36 | 0.51 (0.36-0.68) |

The in-sample and default prequential estimates (prior b = 19) sit at 0.023
to 0.055 whatever the true e, on both selectors: the ratings absorb the
coin flips, and early answers with large rd have p near 1/2, which says
nothing about e. Point ratings help the shipped selector only, and with a
bias: an honest respondent reads 0.15. The staged selector gives no signal at
all, because it asks pairs the current ratings call even (p near 1/2 under
the model, so a lapse looks like an honest answer).

**The information bound** (`--information`): the Fisher information about e
in one answer, from the true win chance of each pair asked, at true e = 0.1,
is 0.70 to 0.81 for shipped, 0.37 to 0.65 for staged and 0.75 to 0.90 for a
uniform random pair. The smallest possible sd of any estimate of e is then
0.27 to 0.33 after 16 answers (8 items, 2 each), 0.11 to 0.15 after 120 (15
x 8), and 0.074 to 0.106 after 240 (30 x 8). Telling an honest respondent
from a 20% lapser needs an sd near 0.07, so about 240 answers even with the
true win chances, and these are not known: the ratings estimating them are
built from the same few answers.

**Rank accuracy and coverage with the best practical estimate** (shipped,
`est-point`, 15 and 30 items, 4 and 8 answers per item, true e 0 to 0.5, 30
respondents per cell, `docs/lapse-estimate-accuracy-2026-11-11.jsonl`): mean
rank accuracy 0.716 at e = 0, 0.718 with the estimate, 0.725 at e = true;
the estimate is better by more than 0.02 in 4 cells of 20 and worse in 3.
Mean 95% coverage 0.915, 0.942 and 0.972: it closes half the coverage gap,
which a fixed e = 0.1 also does (previous section), and it charges honest
respondents the same slower rd as a fixed e because it reads them at 0.15.

**Decision.** Not shipped; the routes keep e = 0. The module and the sweep
modes stay as the measurement. A per-respondent e is not identifiable from
one person's answers at survey lengths, and least of all under the staged
selector the survey uses. What could carry the signal instead: pairs the
respondent should find easy (a known anchor, or a repeat of a confidently
ordered pair: one answer on a pair with true p = 0.95 carries about 2.4 units
of information about e at e = 0.1, 1.7 at e = 0.2, against 0.4 to 0.8 for an
adaptive question, though p itself must then be known), pooled lapse rates
across respondents of one survey (a population e, then shrink each person
toward it), or answer timing. Each is a separate measurement.

Caveats: synthetic respondent with uniform lapses, Bradley-Terry truth with
slope 2 on a uniform spread (a wider spread of true preferences gives more
easy pairs and more information about e); lists of 30 items or fewer; 20 to
30 respondents per cell; no real pairwise answers.


## Anchor pairs and a pooled survey prior: measured, not shipped (2026-11-11)

The section above ended on two signals that might carry a respondent's lapse
share e where the adaptive questions do not: pairs the person should find
easy, and the lapse rates of everyone else in the same survey. Both built and
measured the same day.

**Anchor pairs** (`scripts/anchor-lapse-sweep.ts`, `--every N`). Every N-th
answer, instead of the selector's pair, the survey asks the pair this
respondent's own ratings call most lopsided (largest |p - 1/2| with rd folded
in through Glicko's g; both items shown at least twice; not one of the last 10
pairs; sides drawn at random so position bias cannot fake agreement). e is
read from the anchor answers only, each scored with the chance the ratings gave
it just before the answer. An honest person nearly always agrees with their
own clear preferences; a coin-flipper disagrees half the time.

**A pooled survey prior** (`src/lib/lapseEstimate.ts`, `pooledLapsePrior`
and `posteriorMean`, unit-tested). The lapse distribution of one survey's
respondents over the e grid, fitted by EM on the grid weights from everyone's
anchor likelihoods (the nonparametric maximum-likelihood mixing distribution);
each person's estimate is their likelihood times that prior.

**Setup.** Each "survey" is 60 synthetic respondents (`infoGainSim.ts`) whose
true e is drawn from 0 (60%), 0.1 (15%), 0.2 (10%) and 0.5 (15%); 3 surveys
per cell (180 respondents), two seed sets (1000 / 50000); 15 and 30 items,
4 and 8 answers per item; anchors every 10 or every 5 answers or none. The
score is the AUC of the final estimate for telling honest respondents (e = 0)
from lapsers (e >= 0.2): 0.5 is a coin, 1 is perfect. Raw rows:
`docs/anchor-lapse-2026-11-11.jsonl`.

AUC, uniform prior (run 1 / run 2), and mean rank accuracy:

| selector | items x per item | no anchors | 1 in 10 | 1 in 5 | rank: none / 1 in 10 / 1 in 5 (run 1) |
|---|---|---|---|---|---|
| staged | 15 x 4 | 0.61 / 0.59 | 0.80 / 0.82 | 0.87 / 0.88 | 0.726 / 0.728 / 0.727 |
| staged | 15 x 8 | 0.66 / 0.67 | 0.88 / 0.89 | 0.93 / 0.94 | 0.820 / 0.822 / 0.820 |
| staged | 30 x 4 | 0.57 / 0.60 | 0.84 / 0.90 | 0.92 / 0.90 | 0.741 / 0.716 / 0.708 |
| staged | 30 x 8 | 0.72 / 0.56 | 0.90 / 0.92 | 0.99 / 0.96 | 0.834 / 0.820 / 0.820 |
| shipped | 15 x 4 | 0.88 / 0.83 | 0.78 / 0.77 | 0.83 / 0.89 | 0.709 / 0.716 / 0.681 |
| shipped | 15 x 8 | 0.95 / 0.90 | 0.86 / 0.89 | 0.94 / 0.92 | 0.805 / 0.815 / 0.798 |
| shipped | 30 x 4 | 0.93 / 0.88 | 0.88 / 0.84 | 0.90 / 0.88 | 0.708 / 0.703 / 0.678 |
| shipped | 30 x 8 | 0.96 / 0.97 | 0.92 / 0.93 | 0.95 / 0.93 | 0.821 / 0.808 / 0.800 |

What it shows:

- **Under the staged selector, which the survey uses, anchors are the signal.**
  Without them the estimate is close to a coin (AUC 0.56 to 0.72); one anchor
  in five lifts it to 0.87 to 0.99, one in ten to 0.80 to 0.92. At 15 items
  the rank accuracy does not move (within 0.01 on both seed sets); at 30 items
  x 4 it falls 0.025 to 0.033, at 30 x 8 about 0.01 to 0.014.
- **The shipped selector does not need them.** Its pairs are spread enough
  that all answers already separate lapsers (AUC 0.83 to 0.97); anchors
  replace informative answers and lower both the AUC and, at 1 in 5, the rank
  accuracy (by up to 0.03).
- **The pooled prior does not help the separation** (AUC within about 0.03 of
  the uniform prior in every cell, often a little lower). It does lower the
  level: honest respondents read 0.15 to 0.30 under the uniform prior with
  anchors and 0.12 to 0.24 pooled, lapsers at 0.5 read 0.57 to 0.64 and 0.45
  to 0.60. The estimate stays a ranking of respondents, not a calibrated e.
- **The ceiling is not much higher.** Scoring the same anchor answers with the
  respondent's true win chance (`oracle-flat` in the rows) gives about the
  same AUC as the ratings' chance: the anchor pairs are lopsided enough that
  the ratings' errors hardly matter. The limit is the number of anchors.

**Decision.** Not shipped; the routes keep e = 0 and ask no anchor pairs. What
this does change: a careless-answer flag on the staged selector is now
possible, at one question in five or ten spent on an easy pair. Because the
estimate ranks respondents well but reads honest people at 0.15 to 0.30, the
useful form is a flag or a down-weight in the pooled report (a lapser's
answers count less), not an e fed to the Glicko update. Next step: per-person
weights from the anchor estimate in the pooled ranking, scored with a mixed
population, and the false-flag rate at a fixed threshold (done in the next
section: weights do not help, the pool is already robust to random answers;
the pool is `groupRanking.ts`, not `pooling.ts`, which pools one person's
perspectives).

Caveats: synthetic respondent with uniform lapses and a Bradley-Terry truth;
lists of 30 items or fewer; one population mix; 180 respondents per cell; the
anchor rule is one design (most lopsided pair), not tuned; no real pairwise
answers.

## Anchor weights in the pooled ranking: measured, not shipped (2026-11-11)

The section above left one use for the anchor estimate: a flag or a
down-weight in the survey's pooled ranking, so a careless respondent's answers
count less. Built and measured here (`scripts/anchor-weight-sweep.ts`; raw
rows `docs/anchor-weight-2026-11-11.jsonl`).

**Setup.** Unlike the earlier sweeps, every respondent of a survey shares one
truth: each item gets a common value (uniform on [-1, 1]), and each person
sees it plus their own N(0, 0.25) deviation (`simulate`'s new `truthFor`
argument, unit-tested in `infoGainSim.test.ts`). Each person answers at
random a share e of the time, e drawn from the earlier mix (60% honest,
15% / 10% / 15% at 0.1 / 0.2 / 0.5) or a heavier one (40% honest, 10% / 20% /
30%). They run the staged selector with an anchor every fifth answer; their
final Glicko ratings go into `groupRanking` (the DerSimonian-Laird pool the
report uses). 15 and 30 items, 4 and 8 answers per item, panels of 20 and 60,
30 surveys per cell, two seed sets: 32 cells. A weight w enters the pool as
that person's rd divided by sqrt(w).

Scored on the Spearman correlation of the pooled ranking with the common
truth, as a paired difference (same people, same seeds) from what ships
(no anchors, equal weights; 0.948 to 0.988 across the cells), and on the
share of item pairs the rank ranges call clear that are the wrong way round.

| scheme | what it does | difference from shipped, range over 32 cells | cells beyond 2 SE (up / down) |
|---|---|---|---|
| equal | anchors asked, equal weights | -0.007 to +0.004 | 0 / 0 |
| w-flat | weight (1 - e_hat)^2, uniform prior | -0.014 to +0.003 | 0 / 3 |
| w-pooled | weight (1 - e_hat)^2, survey's pooled prior | -0.013 to +0.004 | 1 / 1 |
| drop-0.4 | leave out e_hat > 0.4 | -0.019 to +0.003 | 0 / 5 |
| drop-0.5 | leave out e_hat > 0.5 | -0.015 to +0.003 | 0 / 3 |
| oracle-w | weight (1 - e)^2 with the true e | -0.009 to +0.004 | 1 / 1 |
| oracle-drop | leave out true e >= 0.2 | -0.018 to +0.004 | 1 / 9 |

A stress check (8 cells) made the case for weights as strong as this model
allows: respondents agree exactly (no personal deviation), the heavy mix (60%
careless), panels of 8 and 20, 4 answers per item, 40 surveys. Weights still
did nothing (w-pooled -0.008 to +0.005, oracle-w -0.004 to +0.009, none beyond
2 SE), and dropping hurt in every cell (drop-0.4 -0.010 to -0.039, oracle-drop
-0.006 to -0.055, all 7 or 8 beyond 2 SE).

What it shows:

- **The pool does not need protecting from random answering.** Even weights
  from the true e do not move the ranking. A careless respondent's ratings
  are a compressed, noisier copy of their preferences: random answers pull
  every rating toward the middle without reordering them, and the 1 - e of
  answers that are honest still point the right way. Averaged with everyone
  else, that copy helps a little more than it harms.
- **Leaving people out is worse than keeping them**, even when the right
  people are left out (oracle-drop): a quarter to a half fewer respondents
  costs more than their noise. In 8-person panels, by 0.006 to 0.055.
- **No scheme makes the report overconfident.** Wrong-way pairs among those
  the rank ranges call clear stay under 0.4% in every cell for every scheme.
- **Flag rates** (uniform prior, anchors every fifth answer; share of
  respondents above the threshold):

  | answers | threshold | honest flagged | e = 0.1 flagged | e >= 0.2 caught |
  |---|---|---|---|---|
  | 15 x 4 (about 11 anchors) | 0.4 | 15-26% | 33-42% | 74-79% |
  | 15 x 4 | 0.5 | 6-13% | 12-23% | 55-64% |
  | 30 x 4 (about 23 anchors) | 0.4 | 2-4% | 10-20% | 69-74% |
  | 30 x 4 | 0.5 | 0.5-2% | 2-9% | 55-63% |
  | 15 or 30 x 8 (23-47 anchors) | 0.4 | 0-6% | 0-19% | 64-79% |
  | 15 or 30 x 8 | 0.5 | 0-2% | 0-8% | 48-59% |

  The false-flag rate is set by the number of anchors a person answers, not
  the list: with about 11 anchors one honest person in five is flagged at
  0.4; with 23 or more, one in twenty or fewer.

**Decision.** Not shipped: the report keeps equal weights and asks no anchor
pairs. The anchor estimate's only remaining use is a data-quality notice for
the survey owner ("these respondents answered their easy pairs at random
about half the time"), at 0.5 and only when a person answered 20 or more
anchors (about 100 answers at one anchor in five), where the false-flag rate
is 2% or less and about 55-60% of lapsers are caught. That notice is not
worth an anchor in every five questions on its own: the ranking does not need
it. Build it only if a survey owner asks for it.

Caveats: synthetic respondents with uniform random lapses and a
Bradley-Terry truth; one personal-deviation size (0.25) and zero; lists of
30 or fewer; panels of 8 to 60. A careless pattern that is not random (always
the left option, always the same item, or answers that track something other
than the question) would bias the pool rather than add noise to it, and is
not covered here: `positionBias` in `infoGainSim.ts` is the place to measure
that next.

## Careless patterns that are not random (2026-11-11)

The section above closed with a gap: a careless pattern that is not random
could bias the pool rather than add noise to it. Measured here
(`scripts/careless-pattern-sweep.ts`, `simulate`'s new `chooser` hook,
unit-tested in `infoGainSim.test.ts`; raw rows
`docs/careless-pattern-2026-11-11.jsonl`).

**Setup.** Shared-truth surveys as above (common truth uniform on [-1, 1],
personal deviation N(0, 0.25)), plus an independent *salience* per item, a
trait unrelated to the question (a familiar name, a short label). A share of
the panel (10%, 25%, 40%, 50%) answers with one pattern on every answer (q = 1;
q = 0.5 spot checks below):

- **random**: a coin flip on every answer (a whole session of noise, where the
  sections above had people lapsing on part of theirs);
- **first**: always the option in the first slot, with slots shuffled per
  pair as `/api/trials/next` does;
- **favourite**: one item of their own, picked whenever it is shown;
- **salience**: picks by the shared salience as consistently as honest people
  pick by taste, so every careless person leans the same wrong way;
- **dissent** (not careless, a control): a camp with a second taste of its
  own, answering honestly. Scored against the whole panel's average taste, so
  a scheme that quiets the camp is penalised.

Everyone runs the staged selector behind the route's slot shuffle; 15 and 30
items, 4 answers per item, panels of 8 and 20 (60 for spot checks), 40
surveys per cell, two seed sets. Pool schemes, each a paired Spearman
difference from shipped (the DerSimonian-Laird pool, equal weights):
`first-flag` (leave out people whose first-slot share is at or beyond 0.7
either way over 30+ answers, the selector's own rule), `loo-w` (weight each
person by max(0, rho)^2, rho the rank agreement of their ratings with the pool
of everyone else), `loo-drop` (leave out rho < 0.2), `median` (per-item median
rating), `oracle-drop` (leave out the careless, the ceiling).

What each pattern does to the shipped pool, and what each scheme recovers
(ranges over items and seeds):

| pattern, share | panel | shipped rho | pool vs salience | wrong-way clear pairs | oracle-drop | first-flag | loo-w | median |
|---|---|---|---|---|---|---|---|---|
| none (honest only) | 8 / 20 / 60 | 0.927-0.987 | -0.07 to +0.03 | 0.0-0.2% | 0 | -0.001 to +0.000 | -0.004 to +0.002 | -0.016 to -0.003 |
| favourite, 50% | 8 | 0.923 | -0.03 | 0.1% | -0.031 to -0.016 | 0 | -0.002 to +0.003 | -0.007 to +0.006 |
| first, 25% | 8 | 0.911 | -0.02 | 0.1% | +0.011 to +0.020 | +0.010 to +0.019 | +0.005 to +0.010 | -0.027 to -0.014 |
| first, 50% | 8 | 0.841 | -0.03 | 0.6% | +0.046 to +0.078 | +0.046 to +0.078 | +0.037 to +0.053 | -0.067 to -0.042 |
| first, 50% | 20 | 0.924 | -0.01 | 0.1% | +0.025 to +0.026 | +0.025 to +0.026 | +0.017 to +0.023 | -0.045 to -0.033 |
| random, 25% | 8 | 0.893 | -0.01 | 0.3% | +0.026 to +0.041 | 0 | +0.021 to +0.030 | -0.005 to +0.005 |
| random, 50% | 8 | 0.783 | -0.01 | 1.4% | +0.101 to +0.133 | 0 | +0.080 to +0.100 | +0.007 to +0.010 |
| random, 50% | 20 | 0.886 | -0.01 | 0.1% | +0.053 to +0.075 | 0 | +0.045 to +0.067 | -0.004 to +0.002 |
| salience, 25% | 20 | 0.902 | **+0.27** | 0.6% | +0.053 to +0.067 | 0 | +0.044 to +0.050 | +0.015 to +0.024 |
| salience, 40% | 20 | 0.773 | **+0.51** | **4.0%** | +0.167 to +0.197 | 0 | +0.064 to +0.091 | +0.033 to +0.047 |
| salience, 40% | 60 | 0.775 | **+0.50** | **8.9%** | +0.197 to +0.204 | 0 | +0.070 to +0.083 | +0.054 to +0.061 |
| salience, 50% | 20 | 0.627 | **+0.68** | **9.4%** | +0.294 to +0.363 | 0 | **-0.051 to -0.038** | -0.049 to -0.034 |
| dissent, 25% | 20 | 0.957 | -0.02 | 0.0% | -0.053 to -0.047 | 0 | **-0.022 to -0.018** | -0.022 to -0.018 |
| dissent, 40% | 20 | 0.948 | -0.02 | 0.0% | -0.171 to -0.147 | 0 | **-0.027 to -0.022** | -0.041 to -0.028 |

How well the leave-one-out agreement tells careless from honest (AUC, honest
over careless; share under 0.2): random and first 0.97-1.00 (honest 0-2.2% under,
careless about 80%); salience 0.97-1.00 at 10-25%, 0.82-0.84 at 40%, 0.39-0.41
at 50% (the careless become the consensus); favourite 0.60-0.72 (it hardly
moves a person's order); dissent 0.98-1.00 at 10-25%, the same as careless.

What it shows:

- **A shared wrong reason is the pattern that harms.** People picking by
  something other than the question, all the same way, pull the pool toward
  it (its correlation with salience rises from about 0 to 0.27 at a quarter of
  the panel, 0.51 at 40%) and make it *confidently* wrong: up to 4.0% and 9.4%
  of the pairs the rank ranges call clear are the wrong way round, where every
  other pattern, and every random-lapse cell before, stayed under 1.5%.
  A bigger panel makes it worse, not better: at 60 respondents with 40%
  picking by salience, 8.9% of clear pairs are the wrong way round (1.9% at a
  quarter), because more people narrow the ranges around the same bias.
- **A favourite item does nothing.** Each person's favourite is different, so
  across a panel they cancel; the pool's order is unchanged (oracle-drop never
  helps, -0.031 to +0.004).
- **Whole-session coin flippers and slot clickers cost the pool**, unlike the
  partial lapses measured above: up to +0.13 (random) and +0.08 (first) is
  available on 8-person panels with half the panel careless.
- **Slot clickers are caught exactly by the selector's own first-option rule.**
  `first-flag` matched oracle-drop in every first-pattern cell, flagged every
  slot clicker, flagged 0.3-0.7% of honest respondents (60 answers each), and
  never moved an honest-only or dissent panel (-0.001 to +0.000). It cannot see
  any other pattern, and needs nothing new from respondents.
- **Agreement weighting helps against careless minorities but taxes real
  minorities.** `loo-w` recovered about 60-90% of oracle-drop for random and
  first, and for salience at 10-25% (about 45% at 40%), and cost honest-only panels nothing (-0.004 to +0.002).
  But it took 0.01 to 0.03 from a genuine 25-40% camp (beyond 2 SE in 36 of 48
  dissent cells, up in none) and backfired at 50% salience (-0.03 to -0.11), where the
  careless are the majority view. Agreement cannot tell a careless block from
  a camp: both score about the same.
- **Half-time carelessness (q = 0.5) is quieter and mostly invisible.** People
  who flip a coin on half their answers cost nothing (oracle-drop -0.010 to
  +0.012), as the lapse sections found. People who pick by salience on half
  their answers still pull the pool toward it (+0.12 at a quarter of the
  panel, +0.27 to +0.29 at half), but only 5-13% of them fall under 0.2
  agreement, so the note will rarely fire for them; `loo-w` would recover a
  third to a half of oracle-drop (+0.005 to +0.034).
- **The median pool is no defence**: slightly worse than shipped on honest
  panels (-0.003 to -0.016) and against slot clickers (-0.07), a little better
  against salience (+0.015 to +0.047).

**Decision.** Shipped two things, in `groupRanking.ts` and the ranking route:

1. **Slot clickers are left out of the pooled ranking** (`slotClickers`): a
   respondent whose first-slot share over 30+ decided answers is at or beyond
   0.7 either way. The route counts each person's decided A/B answers, pools
   the rest, and says so (`leftOut` in the JSON, a note in the builder and the
   report). It is the one scheme that never cost a panel anything here. In the
   real routes an honest person reaches 0.7 by chance (binomial) 4.3% of the
   time at 30 answers, 1.7% at 40, 0.3% at 60 and 0.01% at 100 (the
   integration test seeds `Math.random` for this reason); the sweep says leaving one honest
   person out costs the pool nothing measurable.
2. **A respondent-agreement note, not a weight** (`respondentAgreement`,
   `agreementSummary`): when 5+ respondents can be scored and any fall under
   0.2, the owner is told how many, that this is what careless clicking looks
   like, that a genuine different taste looks the same, and (at 30%+) that the
   panel may be split into groups. The ranking keeps counting them equally.

Not shipped: agreement weights or drops, and the median pool.

Caveats: synthetic respondents; one salience trait at the same strength as
taste; careless people who keep the pattern for the whole session; panels of 8
to 60 and lists of 15 to 30. A careless block that is the majority is not
detectable from the answers at all: only something outside them (timing,
attention checks) could say which view is the careless one.

**A simulator correction found on the way.** `simulate(..., positionBias)`
gives the bias to the policy's first id, and the selectors do not shuffle,
where the route does. Unshuffled, a first-option bias lands on the item the
selector chose first and costs far more than it does live: at 30 items, 300
answers and bias 0.5, mean rank accuracy over 30 seeds is 0.351 unshuffled
against 0.611 shuffled for the information selector, 0.588 against 0.686
for the staged selector and 0.619 against 0.699 for the shipped one. The
2026-10-28 table above (and the 0.421 in `pairing.ts`) used the unshuffled
form, so it overstates the harm; the fallback still pays with the shuffle
(staged 0.686 against information-only 0.611), so `FIRST_OPTION_FALLBACK_SHARE`
stays. The new sweep wraps the policy in the route's shuffle; the old tests
are left as they are, with a caution in `infoGainSim.ts`.

## Position bias behind the slot shuffle (2026-11-11)

The 2026-10-28 position-bias tables ("A respondent who favours the first
option", the first- and second-option fallback tables after it) put every
biased answer on the item the selector chose first, because `simulate` does
not shuffle slots and the route does. Re-measured here with every policy behind
the route's per-pair coin flip (`scripts/position-bias-shuffled-sweep.ts`;
raw per-seed rows for the first seed set in
`docs/position-bias-shuffled-2026-11-11.jsonl`). 30 items, so staged has no
warm-up and differs from the information selector only by its fallback.
`staged@t` falls back to the shipped selector when the first-option share
(30+ decided answers) is at or beyond `t` either way; 0.7 ships. Negative bias
is a second-option bias. Mean rank accuracy, 60 seeds per cell, two seed sets
(seed0 9100 / 50000); "staged - info" is the paired difference at 0.7 with a
95% half-width.

**300 answers**

| bias | shipped | info | staged@0.7 | staged - info | fallback share of answers | honest people it ever fired for |
|---|---|---|---|---|---|---|
| -0.5 | 0.655 / 0.666 | 0.634 / 0.647 | 0.665 / 0.676 | +0.031 ± 0.036 / +0.030 ± 0.035 | 0.78 / 0.84 | |
| -0.3 | 0.796 / 0.781 | 0.781 / 0.785 | 0.804 / 0.798 | +0.023 ± 0.017 / +0.012 ± 0.018 | 0.08 / 0.12 | |
| 0 | 0.893 / 0.895 | 0.914 / 0.908 | 0.914 / 0.909 | +0.001 ± 0.002 / +0.001 ± 0.002 | 0.001 / 0.001 | 5.0% / 1.7% |
| 0.1 | 0.869 / 0.861 | 0.889 / 0.881 | 0.886 / 0.881 | -0.002 ± 0.004 / +0.000 ± 0.008 | 0.004 / 0.003 | |
| 0.3 | 0.804 / 0.800 | 0.785 / 0.794 | 0.782 / 0.797 | -0.003 ± 0.020 / +0.003 ± 0.015 | 0.11 / 0.07 | |
| 0.4 | 0.738 / 0.742 | 0.729 / 0.728 | 0.729 / 0.733 | +0.000 ± 0.029 / +0.005 ± 0.028 | 0.45 / 0.42 | |
| 0.5 | 0.680 / 0.672 | 0.623 / 0.642 | 0.671 / 0.665 | +0.048 ± 0.038 / +0.022 ± 0.036 | 0.79 / 0.84 | |
| 0.6 | 0.557 / 0.581 | 0.544 / 0.520 | 0.605 / 0.560 | +0.061 ± 0.035 / +0.041 ± 0.046 | 0.89 / 0.89 | |

**120 answers**

| bias | shipped | info | staged@0.7 | staged - info |
|---|---|---|---|---|
| -0.5 | 0.444 / 0.464 | 0.484 / 0.501 | 0.476 / 0.483 | -0.008 ± 0.041 / -0.019 ± 0.037 |
| 0 | 0.763 / 0.767 | 0.799 / 0.800 | 0.799 / 0.799 | -0.001 ± 0.001 / -0.001 ± 0.002 |
| 0.3 | 0.637 / 0.646 | 0.623 / 0.643 | 0.628 / 0.637 | +0.005 ± 0.023 / -0.006 ± 0.021 |
| 0.5 | 0.489 / 0.478 | 0.481 / 0.503 | 0.512 / 0.456 | +0.031 ± 0.039 / -0.047 ± 0.039 |
| 0.6 | 0.384 / 0.397 | 0.413 / 0.389 | 0.426 / 0.377 | +0.013 ± 0.043 / -0.012 ± 0.045 |

Thresholds 0.6, 0.65, 0.75 and 0.8 were run in the same cells (the jsonl and
the script's table); none is better than 0.7 in both seed sets.

**Reading.**

- **The old table overstated the harm about fourfold.** At 300 answers and
  bias 0.5 the information selector alone trails shipped by 0.057 / 0.030,
  not 0.211 (0.421 against 0.632). Behind the shuffle half the biased answers
  land on each item, so they mostly add noise to both instead of pushing the
  first-chosen one up.
- **The fallback still pays where it is meant to, at 300 answers:** +0.022 to
  +0.061 over the information selector at bias 0.5 and 0.6 in both seed sets,
  and +0.03 at a second-option bias of 0.5. With it, staged sits within seed
  noise of shipped (or above it) at every bias from 0.3 up, and above shipped
  at 0 and 0.1 (+0.014 to +0.021; level at 0.2). So `FIRST_OPTION_FALLBACK_SHARE` stays at 0.7.
- **At 120 answers it is a wash:** the two seed sets disagree in sign at bias
  0.5 (+0.031, -0.047). With 90 answers after the 30-answer gate there is
  little left for either selector to win.
- **It costs honest people nothing measurable.** With no bias it fired for
  5.0% / 1.7% of respondents at some point, on 0.1% of answers, and moved
  accuracy by 0.001.
- **Where the shuffle threshold lands.** Behind the shuffle a bias b gives a
  first-option share of 0.5 + b/2, so 0.7 fires on average from b = 0.4; the
  fallback share column shows it (0.42-0.45 of answers at 0.4, 0.8+ at 0.5).
  Between 0.3 and 0.4 neither selector is clearly better, so where exactly
  it fires there does not matter much.

Still synthetic, 30 items, one answerer model (a fixed share of biased answers
from the first answer on). `biasedRespondent.simulation.test.ts` keeps the
unshuffled form so its 2026-10-28 numbers reproduce; the tables above replace
its reading. Reproduce: `npx tsx scripts/position-bias-shuffled-sweep.ts
--seeds 60 [--seed0 50000] [--out rows.jsonl]` (about 10 minutes per seed set).

## Answer times: telling a careless block from a camp (2026-11-12)

The careless-pattern section ended on a gap: leave-one-out agreement cannot
tell people who pick by a shared wrong reason from a camp with a genuine
second taste, and a careless majority is invisible in the answers. Every
answer's `Trial.msToAnswer` is stored, so this measures whether time per pick
can say which is which (`scripts/answer-time-sweep.ts`; raw rows
`docs/answer-time-2026-11-12.jsonl`, 171 cells).

**Setup.** The careless-pattern sweep's panels (staged selector behind the
slot shuffle, 15 and 30 items, 4 answers per item, 20 respondents, 40
surveys per cell; 60 respondents and 30 surveys for the stress cells), with
patterns `salience`, `random` and `dissent` (the honest camp, the control) at
25%, 40% and 50% of the panel. Answer times are **simulated, and every part of
the timing model is an assumption**, so the assumptions are swept, not trusted:

- each person has their own pace, 2.5 s times exp(0.4 N) (0.6 in the stress cells);
- an honest answer takes that pace times (1 + gamma x closeness), closeness =
  exp(-|own taste gap| / 0.25), times exp(0.35 N) noise; gamma 0 (no slowing
  on hard pairs) or 0.6;
- a careless answer takes the pace times `ratio` (1: no faster than honest;
  0.6; 0.4), with no slowing on hard pairs (the stress cells let salience
  pickers slow on pairs close in salience, gamma 0.6).

Two signals: **pace** (a person's median time over the panel's median of
medians) and **slope** (Spearman of a person's times with how close each
pair is in everyone else's pool). Pool schemes, each a paired Spearman
difference from shipped: `pace-drop` (leave out pace < 0.6, or 0.5), `loo-drop`
(rho < 0.2), `loo-pace` and `loo-slope` (rho < 0.2 and fast or flat),
`oracle-drop` (leave out the careless; for dissent, the camp).

| pattern, share | careless ratio | pace AUC | slope AUC (gamma 0.6) | pace-drop 0.5 | oracle-drop | honest flagged by pace 0.5 |
|---|---|---|---|---|---|---|
| salience, 25-50% | 1 | 0.50-0.56 | 0.60-0.86 | +0.002 to +0.013 | +0.065 to +0.331 | 1-2% |
| salience, 25-50% | 0.6 | 0.83-0.90 | 0.60-0.86 | +0.027 to +0.067 | same | 0-1% |
| salience, 25-50% | 0.4 | 0.95-0.98 | 0.60-0.86 | +0.053 to +0.151 | same | 0-1% |
| random, 25-50% | 0.4 | 0.95-0.98 | 0.74-0.90 | +0.016 to +0.021 | +0.022 to +0.067 | 0-1% |
| dissent (camp), 25-50% | n/a | **0.50-0.56** | **0.47-0.84** | **-0.002 to -0.005** | -0.043 to -0.298 | 3-4% |

Stress cells (person pace spread 0.6, threshold 0.6, panels of 20 and 60):
14-19% of honest respondents fall under the threshold when the careless are no faster (4-15% when they are, since they pull the panel median down); leaving them out costs
a camp panel 0.005 to 0.019 and a salience panel where the careless are no
faster up to 0.005, and still gains +0.03 to +0.20 where they are.

What it shows:

- **Pace separates careless from honest exactly as far as the careless are
  quicker, and never mistakes a camp for them.** A camp answering at a normal
  pace scores AUC 0.50-0.56 against the majority in every cell: pace has no
  view on taste. That is the property agreement lacked.
- **The answer-time slope is not a camp detector.** Honest people slow down on
  pairs the *panel* finds close, but a camp's hard pairs are close in its own
  taste, so the camp looks flat too (AUC up to 0.84 at 25%): the same confusion
  as agreement. Not shipped.
- **Pace reaches where agreement cannot.** At 50% salience pickers, agreement
  flags 1-5% of them (they are the consensus) and `loo-drop` costs -0.011 to
  -0.015; dropping fast people recovers +0.10 to +0.23 when the careless are at
  0.4-0.6x pace.
- **Dropping by pace has a price when the assumption fails.** When careless
  people are no faster, or a panel's natural paces spread widely, `pace-drop`
  removes fast honest people and costs up to 0.019.

**Decision.** Shipped a note and a comparison, not a default:

1. `respondentPace`, `fastAnswerers` and `paceSummary` in `groupRanking.ts`:
   a respondent with 10+ timed answers (times at or above 120 s ignored) has a
   pace against the panel's median of medians (5+ respondents needed);
   under `FAST_PACE` = 0.5 is fast. The ranking route returns `pace`, and the
   builder and report show its note: how many answered in under half the
   typical time, and how many of the out-of-step respondents (agreement under
   0.2) were among them; when none were, it says the out-of-step answered at a
   normal pace, which looks like a different taste. Slot clickers, already
   left out, are not timed.
2. `?drop=fast` on the ranking route (parsed by `parseDrop`, anything else is a
   400), the builder's "Rank without the fast answerers" button: the ranking
   without them, with `leftOut.fast` and a sentence saying so. The default
   ranking keeps everyone, because the cost when the assumption fails is real
   and the gain depends on an assumption nobody has measured on this product.

Caveats: the timing model is invented; no real answer times from this
product exist yet. The first real survey's `msToAnswer` should be checked
against it: the spread of honest paces (the 0.4 and 0.6 here), whether people
slow on close pairs, and whether out-of-step respondents are in fact quicker.


## Per-person intervals from a refit (2026-11-12, shipped on the insights screen)

The Glicko lapse section above left one gap no lapse term closes: for an
honest respondent the staged selector's 95% pairwise intervals held only about
90% of the time (shipped 97%). The cause is the update, not the answers:
Glicko-2 processes one game at a time against the opponent's point rating,
and the information selector asks exactly the pairs the current ratings call
even, so each answer is booked at the maximum information a game can carry
while the pair's real gap is not even. A posterior computed from all of a
person's answers at once does not have that problem: by the likelihood
principle an adaptive design changes which answers arrive, not what they mean.

**The refit** (`src/lib/btRefit.ts`, tests in `btRefit.test.ts`). Bradley-Terry
with the Glicko-2 link (g = 1) and an independent N(0, phi0^2) prior per item,
phi0 = 350 / 173.7 (the Glicko starting rd, so an unseen item reads as it does
today); Newton's method to the mode, covariance from the inverse negative
Hessian (Laplace). Ties ("about equal") count as half a win each way, the
convention Glicko's score of 0.5 follows. The tests check the mode against a
finite-difference gradient and the covariance against a finite-difference
Hessian. Cost: 18 ms at 50 items and 3000 answers, 34 ms at 200, 190 ms at
400; callers fall back to the stored states past `REFIT_MAX_ITEMS` = 300.

**Coverage and width** (`scripts/refit-coverage-sweep.ts`, synthetic
respondent of `infoGainSim.ts`; 8, 15 and 30 items x 2, 4 and 8 answers per
item, 60 respondents per cell, seed sets from 1000 and 50000;
`docs/refit-coverage-2026-11-12.jsonl`). "Refit, marginal" treats the two
items as independent (what a stored per-item rd can carry); "refit, full"
uses Var(a - b) with the covariance term. Means over the 9 cells, honest
respondent (run 1 / run 2):

| selector | 95% coverage: Glicko | refit, marginal | refit, full | half-width: Glicko | refit, marginal | refit, full | rank accuracy: Glicko / refit |
|---|---|---|---|---|---|---|---|
| staged | 0.910 / 0.904 | 0.971 / 0.972 | 0.947 / 0.947 | 2.35 | 2.75 | 2.34 | 0.788 / 0.791, 0.784 / 0.788 |
| shipped | 0.972 / 0.971 | 0.989 / 0.990 | 0.968 / 0.972 | 2.62 | 2.82 | 2.42-2.43 | 0.758 / 0.767, 0.764 / 0.772 |
| random pair | 0.975 / 0.977 | 0.989 / 0.990 | 0.972 / 0.975 | 2.68-2.69 | 2.87 | 2.49 | 0.744 / 0.759, 0.753 / 0.763 |

For staged the refit's full-covariance intervals reach nominal at the same
width as Glicko's (worst cell 0.88 / 0.87 against 0.82 / 0.80); for shipped
and random pairs they keep Glicko's coverage 7-8% narrower. Rank accuracy is
never worse by more than 0.02 in any of the 216 selector-cells and better by
more than 0.02 in up to 3 cells per lapse for shipped and random. Restricted
to pairs the person was actually asked, staged's coverage is 0.94 for Glicko
and 0.96 for the refit, so most of Glicko's miss sits on pairs it never asked,
whose difference it can only read from two independent rds.

With careless answers neither is calibrated, since both assume none: at a
true lapse of 0.2 staged reads Glicko 0.859 / 0.856 against refit 0.899 /
0.899; shipped reads 0.944 / 0.948 against 0.919 / 0.933, and at 0.35 shipped
reads 0.905 / 0.923 against 0.872 / 0.895 (the refit's narrower intervals cost
it there).

**Not for the couple bar or the selector.** The refit's marginal rd is wider
than Glicko's, so the couple screen's bar (min(8, items) items under rd 200)
would take longer (`--couple-bar`, median / p90 answers, 40 respondents):
staged 8 items 19 / 20 to 31 / 63, 15 items 27 / 27 to 32 / 34, 30 items
35 / 35 to 41 / 45; shipped 8 items 26 / 31 to 30 / 69. The stored states
stay what the selector and the couple bar read; the refit is for reporting.

## The clear-top-pick claim (2026-11-12, shipped)

The insights screen's "top pick" and "bottom pick" cards called the leader
clear when it was ahead of the runner-up by more than half its own rd, and
otherwise said "still too close to call: it's between X, Y, Z". Measured on
the same synthetic respondents (`scripts/clear-pick-sweep.ts`, 8/15/30 items x
2/4/8 answers per item, 60 respondents per cell, 540 per row;
`docs/clear-pick-2026-11-12.jsonl`), as the share of respondents the claim
fires for and the share of those claims naming an item that is not the
person's true favourite (run 1 / run 2):

| truth spread, lapse | selector | old rule fires / wrong | highest-rated item wrong | z = 1 fires / wrong | z = 1.645 fires / wrong |
|---|---|---|---|---|---|
| 1, 0 | staged | 0.76 / 0.58, 0.78 / 0.57 | 0.59, 0.59 | 0.15 / 0.45, 0.15 / 0.32 | 0.022 / 0.17, 0.019 / 0.20 |
| 1, 0 | shipped | 0.44 / 0.52, 0.45 / 0.50 | 0.63, 0.62 | 0.07 / 0.33, 0.10 / 0.27 | 0.006 / 0, 0.011 / 0.33 |
| 1, 0.2 | staged | 0.77 / 0.70, 0.76 / 0.63 | 0.71, 0.66 | 0.17 / 0.57, 0.13 / 0.44 | 0.015 / 0.38, 0.015 / 0.38 |
| 2, 0 | staged | 0.78 / 0.46, 0.78 / 0.42 | 0.50, 0.45 | 0.19 / 0.24, 0.20 / 0.25 | 0.041 / 0.05, 0.033 / 0.11 |

(z rules: the refit's leader beats every other item by more than z sd of the
difference, full covariance; comparing with the runner-up only moved nothing
by more than 0.03. Spread 2 is a respondent with twice as strong likes and
dislikes.)

**Reading.** The old rule was close to no rule: three staged respondents in
four were told they had a clear favourite, and that favourite was wrong about
as often as simply naming the highest-rated item. At the lengths people answer
here, the top two items of a list are usually too close for their answers to
separate. **Shipped:** the route now refits each person's answers and calls a
pick clear only when it beats every other item by 1.645 sd of the difference
(`src/lib/clearPick.ts`, one-sided 95%; the same rule for the bottom pick).
It fires rarely (2-4% of staged respondents), and its claims are wrong 5-20% of
the time on 10-22 claims per row, so those rates are rough. Everyone else sees the card's
"it's between X, Y, Z" line (the next section measured that line: as first
shipped it held the true favourite only 68-74% of the time). Pinned by
`src/app/api/insights/clearPick.integration.test.ts`, which fails on the old
route (stored ratings 40 points apart at rd 70 with answers that do not back
them: claimed clear before, contested now).

Caveats: synthetic Bradley-Terry respondents with uniform truth; 30 items or
fewer; no real pairwise answers; the z = 1.645 wrong-claim rates rest on few
claims. Next: whether the "between X, Y, Z" list holds the true favourite (a
top-3 credible set from the refit is the natural replacement for "the three
highest"), and the PrefLib panels (`scripts/real-rankings-eval.ts`) through the
refit.

## Who it's between (2026-11-12, shipped on the insights screen)

When the clear-pick rule above declines to name a favourite, the card says
"still too close to call: it's between X, Y, Z". X, Y, Z were the three
highest-rated items. The question this section answers: how often does that
list hold the person's true favourite?

**Measured** (`scripts/favourite-set-sweep.ts`, the same synthetic
respondents: 8/15/30 items x 2/4/8 answers per item, 60 respondents per cell,
honest unless stated; counted only for respondents the card is shown to, i.e.
the clear-pick rule did not fire, 518-540 of 540 per row;
`docs/favourite-set-2026-11-12.jsonl`). "Set p" is the refit's credible set
(`src/lib/favouriteSet.ts`): the fewest items whose posterior chances of
being the favourite sum to p, the chances read by 4,000 seeded draws from
the Laplace posterior (full covariance). Coverage is the share of lists
holding the true favourite; size is the list length, mean / 90th percentile.
Seeds from 1000, then 50000:

| respondent | selector | three highest | set 0.9 | set 0.95 | set 0.95 size | worst cell, three highest / set 0.95 |
|---|---|---|---|---|---|---|
| spread 1 | staged | 0.741, 0.730 | 0.818, 0.819 | 0.879, 0.881 | 5.2 / 11 | 0.42 / 0.75 |
| spread 1 | shipped | 0.680, 0.700 | 0.829, 0.833 | 0.896, 0.916 | 6.1 / 12 | 0.30 / 0.77 |
| spread 2 | staged | 0.822 | 0.878 | 0.934 | 5.0 / 10 | 0.50 / 0.82 |
| spread 2 | shipped | 0.799 | 0.906 | 0.962 | 5.6 / 12 | 0.57 / 0.90 |
| lapse 0.2 | staged | 0.609 | 0.671 | 0.763 | 5.2 / 11 | 0.27 / 0.62 |
| lapse 0.2 | shipped | 0.624 | 0.743 | 0.826 | 6.5 / 12 | 0.32 / 0.63 |
| bottom pick | staged | 0.747 | 0.823 | 0.892 | 5.2 / 11 | 0.55 / 0.77 |
| bottom pick | shipped | 0.636 | 0.813 | 0.897 | 6.3 / 12 | 0.28 / 0.82 |

By cell (spread 1, staged, seeds from 1000), three highest against set 0.95
(mean size): 8 items 0.77-0.97 against 0.92-0.98 (3.0-4.3); 15 items
0.70-0.89 against 0.90-0.92 (3.3-6.3); 30 items 0.42-0.66 against 0.75-0.83
(4.3-11.5). The three-highest list is worst exactly where it matters, long
lists with few answers (0.30 for shipped at 30 items and 2 answers each),
because three is too few names there; with many answers on a short list the
set shrinks to two or three names and is right more often than the fixed
three.

**The set undercovers, and the prior is why.** At spread 1 the 0.95 set
holds the favourite 88-92% of the time, at spread 2 (stronger likes and
dislikes) 93-96%. The refit's prior sd (Glicko's 350, 2.0 on the logit
scale) is wider than the simulated truth (uniform on [-1, 1] at slope 2,
so sd 1.155 on the logit scale; this line said 0.58 until the next section
caught the missing factor of two), so
the posterior shrinks the leader too little and is too sure of it, a
winner's curse that per-pair intervals (previous sections, calibrated) do
not show because the favourite is a maximum over many items. Refitting with
a narrower prior only for the set (`--prior-phi`): sd 1.0 gives 0.953-0.968
at the 0.95 level (size 7.5 / 15), sd 0.58 (half the true spread, see
above) overcovers (0.987-0.994, size 9.4-10.5 / 19-20). **Not shipped:**
tuning the prior to the simulator's own truth would calibrate the set to an
assumption, not to people; an empirical-Bayes prior sd estimated from each
person's answers is the principled version and the next thing to try.

**Shipped:** the card lists the 0.95 set, most likely first, never fewer than
two names; past three it names the first three and counts the rest ("most
likely A, B, C, or one of 4 more you rated near them"), so the card stays
short without claiming a shorter list than the answers allow. No percentage
is printed: the chances behind it are measurably overconfident (above).
Items outside one refit (another survey's states, or past
`REFIT_MAX_ITEMS`) enter as independent with their stored rd. Items more
than 3.5 sd of the difference behind the leader are left out of the draws
(a marginal of a Gaussian is exact, and such an item's chance against the
leader alone is under 1 in 4,000); draws are seeded, so the same answers give
the same card. Pinned by `src/lib/favouriteSet.test.ts` (the two-item closed
form within 0.01, covariance, prefilter, determinism) and a case in
`src/app/api/insights/clearPick.integration.test.ts` that fails on the old
route: five items each beat a sixth and are never compared with each other,
so all five could be the favourite; the old route named three.

Caveats: synthetic Bradley-Terry respondents; with careless answers (lapse
0.2) neither list is calibrated (0.61-0.62 and 0.76-0.83); 30 items or
fewer; no real pairwise answers. Next: an empirical-Bayes prior sd for the
refit (which would move the pairwise intervals too, so re-measure those);
the PrefLib panels (`scripts/real-rankings-eval.ts`) through the refit and
the set.

## An empirical-Bayes prior (2026-11-12, later; shipped for the set only)

The previous section found the favourite's credible set undercovering
because the refit's prior sd (2.0, Glicko's 350) is wider than the simulated
truth, and left the fix open: estimate the prior sd from each person's own
answers rather than tune it to the simulator. This section does that, finds
the textbook way of doing it fails under the staged selector, and fixes it.

**Method** (`src/lib/btRefit.ts`). Type-II maximum likelihood: the prior sd
phi that maximises the marginal likelihood (the evidence) of the person's
answers, searched by golden section on log phi in [0.3, 2.0] (never wider
than the fixed prior; the floor stops the known collapse to zero on a few
mixed answers). Two evidence estimates:

- `refitEvidence`, the Laplace form: log-likelihood and log-prior at the
  mode plus half the log-determinant of the posterior covariance.
- `sampledEvidence`, importance sampling from the Laplace posterior with
  its covariance inflated 1.1^2, 2,000 seeded draws (the same seed for
  every phi, so the search sees smooth noise). Exact on one answer (log 1/2
  for any phi, by symmetry) and within 0.02 of quadrature on one pair
  answered four ways (`src/lib/btRefitEb.test.ts`). Inflation matters: at
  30 items an inflation of 1.5 gave an sd of 0.3 in the log evidence across
  seeds, 1.1 gives 0.02, since a wider proposal multiplies the weights'
  variance once per item.

`pooledPriorPhi` sums the evidence over several respondents (one prior sd
for a survey, each person with their own scores).

**The Laplace evidence fails under the staged selector.** Summed over
synthetic respondents, the Laplace and sampled log evidence on a grid of
phi (`scripts/eb-laplace-check.ts`; the true spread is 1.155):

| cell | selector | Laplace peak | sampled peak |
|---|---|---|---|
| 8 items x 2 answers, 40 people | shipped | 0.6 | 0.8 |
| | staged | **0.3** | 1.2 |
| 15 x 4, 30 people | shipped | 1.0 | 1.0 |
| | staged | **0.45** | 1.2 |
| 30 x 4, 20 people | shipped | 1.0 | 1.0 |
| | staged | **0.45** | 1.2 |

Staged asks pairs the current ratings call even. The posterior of those
differences is far from Gaussian, and the Laplace curvature then rewards a
small prior. Pooled over 60 respondents, the Laplace estimate still sat at or
near the 0.3 floor (0.36 or less) in 4 and 5 of 9 staged cells (two seed
bases). The sampled one gives 0.99-1.25 and 0.66-1.09 across the honest
staged cells, and 1.10-1.39 for shipped. Every Laplace-era number is
kept in `docs/eb-prior-2026-11-12.jsonl` (run names say which).

**Favourite set, sampled evidence** (`scripts/favourite-set-sweep.ts --eb
--pool`, the previous section's 8/15/30 items x 2/4/8 answers per item, 60
respondents per cell, counted where the card is shown; coverage / mean size,
seeds from 1000 then 50000):

| respondent | selector | fixed prior, set 0.95 | own EB prior, set 0.95 | pooled EB prior, set 0.95 |
|---|---|---|---|---|
| spread 1 | staged | 0.879 / 5.2, 0.881 / 5.1 | 0.934 / 8.4, 0.955 / 8.7 | 0.949 / 7.1, 0.957 / 7.8 |
| spread 1 | shipped | 0.896 / 6.1, 0.916 / 6.0 | 0.948 / 7.6, 0.953 / 7.4 | 0.950 / 7.2, 0.951 / 6.9 |
| spread 2 | staged | 0.934 / 5.0 | 0.948 / 6.4 | 0.934 / 5.0 |
| spread 2 | shipped | 0.962 / 5.6 | 0.966 / 5.8 | 0.962 / 5.6 |
| lapse 0.2 | staged | 0.763 / 5.2 | 0.904 / 10.0 | 0.940 / 9.0 |
| lapse 0.2 | shipped | 0.826 / 6.5 | 0.950 / 9.3 | 0.937 / 8.8 |

(Pooled: one phi per cell, estimated on an independent panel of 60 with the
same design, seeds + 100000.) At spread 2 the true sd (2.31) is past the
2.0 ceiling, so the estimate mostly sits there and nothing changes.
Careless answers look like a narrow spread, so the estimate shrinks and the
set widens, which is the safe direction for this claim. The cost is length:
staged lists grow from about 5 names to about 8.5, most of it in long lists
with few answers (30 items x 2: 11.5 to 18.5 names, coverage 0.83 to 0.92).
The card names three and counts the rest either way. Worst cells stay at
0.85-0.92 (30 items x 8 answers under staged: 0.76 fixed, 0.86 own, 0.85
pooled). Per person, 22-25% of staged respondents hit the 0.3 floor (honest
answers) and 6-7% of shipped ones.

**Pairwise intervals: not changed.** The same refit's 95% intervals for
every pair of items (`scripts/refit-coverage-sweep.ts --eb | --pool`, 40
respondents per cell, 8/15/30 items x 2/4/8 answers; mean over cells,
full covariance, half-width on the logit scale):

| selector, lapse | fixed prior | own EB prior | pooled EB prior |
|---|---|---|---|
| shipped, 0 | 0.967 / 2.41 | 0.835 / 1.78 | 0.934 / 1.88 |
| staged, 0 | 0.948 / 2.34 | 0.769 / 1.71 | 0.926 / 1.78 |
| shipped, 0.2 | 0.919 / 2.42 | 0.670 / 1.48 | 0.749 / 1.55 |
| staged, 0.2 | 0.905 / 2.41 | 0.643 / 1.49 | 0.657 / 1.35 |

At the right prior (pooled, honest) the intervals are 22-24% narrower and
cover 0.93, slightly under nominal (a Gaussian prior on uniform truth
over-shrinks the extreme items). One person's own estimate is too noisy for
intervals (0.77-0.84), and careless answers break both (0.64-0.75), where the
wide fixed prior keeps 0.90-0.92. Rank accuracy moves by 0.01 at most. The ratings, the intervals and the clear-pick rule keep the fixed prior.
The clear-pick rule on the EB refit fired for 8 of 540 staged respondents
(2 wrong) against 12 (2 wrong) on the fixed one.

**Shipped:** the insights route refits each person's answers a second time
at their own empirical-Bayes prior sd and draws the "it's between" set from
that refit (`src/app/api/insights/route.ts`; `contenders(..., { score })` in
`src/lib/favouriteSet.ts`). The rest of the screen is unchanged. The
search takes about 60 ms at 15 items x 4 answers, 215 ms at 30 x 8 and 600 ms
at 60 x 8, so past `EB_MAX_ITEMS` (40) answered items the set uses the
fixed-prior refit as before. The shipped search uses 8 golden-section steps
(phi within about 4.5%); the tables above ran 14, and a rerun at 8 (spread
1 and lapse 0.2, seeds from 1000) matched every coverage to 0.001 and every
mean size to 0.02. Pinned by
`src/lib/btRefitEb.test.ts` (Laplace evidence against a one-pair closed
form, sampled evidence against quadrature, the search's maximum on a grid,
floor and ceiling cases, recovery of a known spread, pooling) and a case in
`src/app/api/insights/clearPick.integration.test.ts` that fails on the old
route: a six-item round robin where the earlier item wins two answers in
three; the fixed prior lists four items, the person's prior keeps the fifth.

Why the person's own estimate and not the pooled one, which is calibrated
at shorter lengths: pooling needs other respondents' answers at request
time (a survey-level estimate stored and refreshed is the way to do it),
and its estimate mixes people whose spreads differ. Next: a stored per-survey
pooled phi, refreshed when answers arrive, as the set's prior (sizes 7.1-7.8
against 8.4-8.7 here); a heavier-tailed or uniform-aware prior for the
pairwise intervals; real pairwise answers.

Caveats: synthetic Bradley-Terry respondents with uniform truth; 30 items or
fewer in the sweeps; 60 respondents per cell, so a coverage differs by about
0.01 between seed bases; no real pairwise answers.


## A stored survey prior (2026-11-12, latest; shipped as a floor, not a replacement)

The previous section left one step open: store a pooled prior sd per survey
and draw the set from it, since in its sweep the pooled sd covered as well as
the person's own at shorter lengths (7.1-7.8 names against 8.4-8.7). That
sweep pooled over a panel that shared one spread of likes and one lapse rate,
so the pooled value was the right answer for everyone in it. A real survey
mixes people. This section measures the mixed case, finds pooling alone is
wrong for the people whose likes are close together, and ships the pooled sd
as a floor on the person's own.

**Design** (`scripts/mixed-prior-sweep.ts`). Respondents cycle through
spreads 0.5, 1 and 2 and lapse rates 0 and 0.2 (six equal groups); the
pooled sd is estimated on an independent panel of the same mixture (120,
seeds + 100000); 120 scored respondents per cell, the same 8/15/30 items x
2/4/8 answers per item, both selectors, counted where the card is shown,
the 95% set; seed bases 1000 and 50000. Five priors: the fixed 2.0; the
person's own estimate (shipped earlier today); the pooled one; the
geometric mean of own and pooled ("shrink"); the narrower of the two
("min"). Coverage / mean size (raw rows: `docs/mixed-prior-2026-11-12.jsonl`):

| selector | group | fixed | own | pool | shrink | min |
|---|---|---|---|---|---|---|
| shipped | all | 0.861 / 6.4, 0.868 / 6.3 | 0.943 / 8.8, 0.937 / 8.5 | 0.922 / 7.9, 0.937 / 7.9 | 0.935 / 8.3, 0.939 / 8.1 | **0.954 / 9.2, 0.956 / 9.0** |
| | spread 0.5 | 0.744, 0.819 | 0.905, 0.947 | 0.833, 0.917 | 0.877, 0.936 | 0.911, 0.956 |
| | spread 0.5, lapse 0.2 | 0.700, 0.783 | 0.883, 0.939 | 0.772, 0.889 | 0.839, 0.917 | 0.889, 0.939 |
| | worst cell | 0.742, 0.750 | 0.892, 0.858 | 0.825, 0.867 | 0.875, 0.875 | 0.908, 0.892 |
| staged | all | 0.813 / 5.2, 0.841 / 5.1 | 0.922 / 9.1, 0.926 / 9.0 | 0.914 / 7.8, 0.940 / 7.2 | 0.933 / 8.3, 0.941 / 8.1 | **0.957 / 10.1, 0.964 / 9.8** |
| | spread 0.5 | 0.697, 0.764 | 0.881, 0.888 | 0.827, 0.888 | 0.881, 0.899 | 0.918, 0.938 |
| | spread 0.5, lapse 0.2 | 0.670, 0.719 | 0.875, 0.854 | 0.813, 0.854 | 0.881, 0.854 | 0.920, 0.916 |
| | worst cell | 0.683, 0.733 | 0.867, 0.875 | 0.795, 0.867 | 0.855, 0.892 | 0.889, 0.925 |

The pooled sd lands near 1 (0.61-1.21 by cell), the middle of the mixture:
too wide for the spread-0.5 people, whose coverage falls to 0.83-0.92
(0.77-0.89 when they also answer carelessly), and too narrow for the
spread-2 people, who over-cover (0.96-1.00). Pooling buys its shorter lists
from exactly the people whose answers are hardest. Shrink sits between and
is not clearly better than own on the shipped selector (0.935 and 0.939 against 0.943 and 0.937). The narrower of own and
pooled is the only rule that reaches the 95% label overall on both
selectors and both seed bases (0.954-0.964 against own's 0.922-0.943), and
it lifts every worst cell (0.889-0.925 against 0.858-0.892) and the
hardest group (spread 0.5 with lapses: 0.889-0.939 against 0.854-0.939). It
costs 0.4-1.1 names on average, most of it in lists the card already cuts
to three names and a count.

Why min works: the person's own estimate errs in both directions, and the
direction that hurts the claim is too wide (a wide prior shrinks the leader
too little, the winner's curse of the previous sections). Taking the
narrower of two noisy estimates removes most of the too-wide errors; it
also makes some lists longer than they need be, which costs length, not
correctness.

**Shipped** (`src/lib/surveyPrior.ts`, `src/lib/surveyPriorStore.ts`,
migration `20261112000000_survey_set_prior`): the Survey row stores the
pooled sd (`setPriorPhi`), how many respondents it pooled and the survey's
decided-answer count when it was estimated. The insights route reads it and
draws the set at `min(own, stored)` once it pools at least 10 respondents;
below that, own alone, as before. After its response (next/server `after`)
the route refreshes the stored value when the answer count has grown by a
quarter and by at least 20 since the last estimate (the first estimate
waits for 40 answers). A refresh pools the 40 most recent respondents with
at least 4 answers and at most 40 answered items (`EB_MAX_ITEMS`), searches
with `pooledPriorPhiAsync`, which yields to the event loop after each
respondent (2.5 s of CPU at 40 people x 15 items x 4 answers, 7.5 s at 30 x
8, 11.5 s at 40 x 8), and writes only if no newer estimate landed in the
meantime. The ratings, intervals and clear-pick rule are unchanged.

Pinned by `src/lib/surveyPrior.test.ts` (eligibility, the minimum, the
staleness rule, the async search equal to the synchronous one, the min
rule) and `src/lib/surveyPriorStore.integration.test.ts` against Postgres:
no estimate under 10 respondents; the stored estimate equals the pooled
search; no recompute on a few new answers, a recompute after a quarter
more; and on the route, a survey prior of 0.3 lengthens a six-item round
robin's list from three names to four, while a wider one (2.0) or one
behind 9 respondents changes nothing (fails with the route's old
own-only rule).

Caveats: synthetic Bradley-Terry respondents with uniform truth; the
mixture is equal thirds and halves, chosen, not measured; 30 items or
fewer; group rows have about 175 respondents, so a group's coverage moves
by about 0.02-0.05 between seed bases (the table shows both); the refresh
pools the most recent respondents, so a survey whose audience changes
follows it with a lag of a quarter of its answers. No real pairwise
answers yet. Next: the PrefLib panels through the refit and the set, and a
heavier-tailed prior for the pairwise intervals.


## Staged as the default up to 120 items (2026-11-12)

The insights card can name a person's single favourite 35-100% of the time
under staged and 0.5-5.5% under standard on real people's rankings
(REAL-RANKINGS.md, "The insights card on real people"), but standard was the
server default, so every survey that never opened the "Question order" menu
got the weaker one. The three sweeps that measured careless respondents had
all run staged only. So before changing the default they were re-run under
both selectors on the same seeds (`--selector staged|standard`, added to
`careless-pattern-sweep.ts` and `answer-time-sweep.ts`; the position-bias
sweep already compares them). Raw rows: `docs/staged-default-2026-11-12.jsonl`
(284 cells, each tagged with its sweep and selector),
`docs/staged-default-position-bias-2026-11-12.txt`, and the real-panel replay
`docs/staged-default-real-rankings-2026-11-12.md`
(`real-rankings-eval.ts --seeds 40 --selectors shipped,staged`).

**Careless patterns** (15 and 30 items, 4 answers per item, panels of 8 and
20, careless shares 0/25/40/50%, 40 surveys a cell; pooled Spearman with the
common truth, standard / staged):

| panel | standard | staged | difference |
|---|---|---|---|
| honest only (4 cells) | 0.938-0.966 | 0.940-0.970 | -0.001 to +0.004 |
| slot clickers, 25-50% (12) | 0.834-0.952 | 0.837-0.960 | -0.007 to +0.025, up in 11 |
| a favourite item, 25-50% (12) | 0.913-0.965 | 0.916-0.970 | -0.005 to +0.005 |
| a camp with its own taste, 25-50% (12) | 0.884-0.960 | 0.888-0.963 | -0.010 to +0.012 |
| pick by salience, 25-50% (12) | 0.616-0.908 | 0.613-0.912 | -0.023 to +0.007 |
| whole-session coin flips, 25-50% (12) | 0.819-0.950 | 0.794-0.950 | **-0.025 to +0.005**, down in 9 |
| half-time salience or coin flips (q = 0.5, 8) | 0.891-0.959 | 0.891-0.964 | -0.001 to +0.006, up in 6 |

Across all 80 cells at q = 1 the mean difference is +0.0007 (staged ahead in
48). Staged calls about 10% more pairs clear (109 against 99 a survey), and
the share of those that are the wrong way round is 0.61% against 0.51%; in
the salience cells the pool leans toward salience by 0.01-0.03 more (+0.26 to
+0.68 against +0.26 to +0.66). The one consistent cost is a panel where
40-50% of people flip a coin on every answer: staged's pool is 0.012-0.025
lower on 8-person panels and 0.006-0.014 on 20, because its pairs are the
close ones, and a coin flip on a close pair moves the ratings more. The
defences are no weaker: oracle-drop recovers more under staged (+0.063 to
+0.105 against +0.047 to +0.087 at 50%), leave-one-out agreement still tells
coin flippers apart (AUC 0.96-1.00 under both), and the first-option rule
still catches every slot clicker.

**Position bias behind the slot shuffle** (30 items, 30 seeds, rank accuracy,
standard / staged at the shipped 0.7 fallback): at bias 0, 0.776 / 0.809 (120
answers) and 0.890 / 0.921 (300). Staged is ahead in 18 of 20 cells from
-0.5 to +0.6; behind at 300 answers with bias -0.3 (0.800 / 0.796) and +0.5
(0.674 / 0.658), where the fallback serves 77% of answers.

**Answer times** (the 2026-11-12 grid, 54 cells): pace tells the careless
from the honest as well under staged (AUC within 0.03 in every cell; 0.88-0.98
when the careless are at 0.4-0.6x pace) and still never mistakes a camp for
them (0.50-0.56 under both). `pace-drop` gains as much or more (+0.035 to
+0.227 against +0.033 to +0.201 for fast salience pickers). The slope signal
is 0.00-0.06 weaker under staged, and it was not shipped. The coin-flip cost
shows again (0.873-0.948 against 0.905-0.950 at 25-50%).

**Real panels** (breakfast, 42 people x 15 items; T-shirts, 30 x 11; 40
seeds): staged's Spearman against the people not asked is at least
standard's in 22 of 25 cells and at most 0.01 below in the other three; its
rank ranges hold 93-100% against 95-100%, up to 0.7 places narrower, with -1
to +5 points of pairs ordered.

**Decision.** Staged is the server default for lists up to 120 items
(`defaultPairSelector`), lists above 120 keep standard (the 120-answer
warm-up and the switch rule there are item (e) of the plan, not measured
here), and a survey's own setting or `PAIR_SELECTOR` still wins. The gain is
the insights card's clear pick and a slightly better pooled ranking on real
people; the cost is up to 0.025 of pooled Spearman when half of a small panel
are whole-session coin flippers, a panel the agreement note already flags.


## Self-consistency: a coin-flip check that does not tax camps (2026-11-12, measured, not shipped)

The section above left one cost of the staged default: a panel where 40-50% of
people flip a coin on every answer pools 0.006-0.025 lower than under standard.
The defences measured so far either cannot see coin flippers (`first-flag`) or
see them by disagreement with the rest of the panel (`loo-w`, `loo-drop`),
which taxes a real camp with a taste of its own by 0.01-0.03. This section
tried a check that looks only at a person's own answers.

**The score** (`src/lib/selfConsistency.ts`, unit-tested). A person's answers
are split into five interleaved folds; each fold is predicted by a
Bradley-Terry refit (`btRefit.ts`, prior sd 1 on the logit scale) of the other
four and scored in bits over a coin. `z` is the mean gain over its standard
error; `logBayesFactor` is the Laplace evidence of a Bradley-Terry taste over a
coin on all the answers. Someone answering by a stable taste, the panel's or
their own, should score above zero; a coin flipper at or below it. Reversing a
person's taste leaves every reading unchanged (a test checks this), so it
cannot penalise a camp for disagreeing.

**Two schemes** were added to `scripts/careless-pattern-sweep.ts`
(`--self-z`, `--self-bf`): `self-drop` leaves out people whose own z is under a
threshold, and `gate-drop` leaves out people only if they are under the 0.2
agreement line *and* their own answers are inconsistent (z under 0.5 or 1, or
log BF under 0). A new script, `scripts/coin-flip-gate-real.ts`, runs the same
defences on the PrefLib panels of REAL-RANKINGS.md, with a share of the sampled
real people swapped for whole-session coin flippers and scored against the
people not asked (`--honest-lapse e` adds random answers to the real people
too, since a replayed ranking answers without noise).

Raw rows: `docs/self-consistency-2026-11-12.jsonl` (96 synthetic cells, tagged
with their seed base) and `docs/self-consistency-real-2026-11-12.jsonl` (64 real
cells, tagged with selector and honest lapse).

**Synthetic panels** (staged selector, 15 and 30 items, 4 answers per item,
panels of 8 and 20, 40 surveys a cell, seed bases 2000 and 50000; paired
difference from the shipped pool, range over cells, cells beyond 2 SE up / down
summed over both seed sets):

| panel | loo-drop | gate-drop, z < 0.5 | gate-drop, z < 1 | gate-drop, log BF < 0 | oracle-drop |
|---|---|---|---|---|---|
| honest only (4 cells a seed set) | -0.001 to +0.000 | -0.000 to +0.001 | -0.001 to +0.000 | -0.000 to +0.001 | 0 |
| coin flippers, 25% (8) | +0.004 to +0.032 (7 / 0) | -0.001 to +0.019 (5 / 0) | +0.002 to +0.025 (6 / 0) | +0.001 to +0.030 (5 / 0) | +0.011 to +0.038 |
| coin flippers, 40-50% (16) | +0.021 to +0.103 (16 / 0) | +0.011 to +0.052 (15 / 0) | +0.015 to +0.081 (16 / 0) | +0.013 to +0.088 (16 / 0) | +0.028 to +0.134 |
| a camp, 25% (8) | **-0.027 to -0.009** (0 / 6) | -0.006 to +0.001 (0 / 4) | -0.010 to -0.001 (0 / 4) | -0.013 to -0.001 (0 / 4) | -0.051 to -0.027 |
| a camp, 40-50% (16) | **-0.050 to -0.002** (0 / 11) | -0.014 to +0.001 (0 / 3) | -0.019 to +0.002 (0 / 10) | -0.020 to +0.001 (0 / 8) | -0.275 to -0.100 |

Slot clickers (seed base 2000, 12 cells): the gate recovers +0.004 to +0.040
against `first-flag`'s +0.007 to +0.058, which already ships and matches
oracle-drop. `self-drop` alone lost in every cell (-0.008 to -0.118, honest panels
included). How well the scores tell coin flippers from honest people (AUC):
own z 0.60-0.69, own log BF 0.67-0.80, agreement 0.96-1.00; camp members from
honest people: own z 0.47-0.58, own BF 0.47-0.55 (blind, as intended),
agreement 0.49-1.00.

**Real panels** (breakfast 20 of 42 people at 30 and 60 answers, T-shirts 10
of 30 at 20 and 44; 80 draws, staged; honest = the panel's own people, camps
and all):

| real people's own answers | panel | loo-drop | gate, z < 1 | oracle-drop | honest people under 0.2 agreement / also gated |
|---|---|---|---|---|---|
| as ranked (no noise) | honest only | -0.010 to +0.001 | -0.013 to +0.000 | 0 | 18-32% / 0.7-17% |
| as ranked | 25% coin | +0.015 to +0.030 | +0.008 to +0.029 | +0.030 to +0.071 | |
| as ranked | 40-50% coin | +0.023 to +0.048 | +0.041 to +0.078 | +0.081 to +0.149 | |
| 20% random | honest only | -0.014 to -0.003 | -0.004 to +0.009 | 0 | 20-36% / 6.5-24% |
| 20% random | 40-50% coin | -0.008 to +0.033 | -0.009 to +0.062 | +0.085 to +0.164 | |
| 35% random | honest only | **-0.033 to -0.015** | **-0.035 to -0.007** | 0 | 25-46% / 13-32% |
| 35% random | 40-50% coin | -0.020 to +0.027 | -0.065 to +0.036 | +0.097 to +0.153 | |

With 4 answers per item (breakfast 60, T-shirts 44) and clean answers the gate
left out 0.2-6% of real people and recovered 40-70% of oracle-drop at 40-50% coin flippers; at 2
answers per item it gated 10-25% of them. Under the standard selector the gate
gated 0-2% of real people at every budget (its pairs are spread, so a person's
own answers show their consistency), and recovered +0.009 to +0.078.

What it shows:

- **Under staged, a person's own answers barely beat a coin.** An honest
  synthetic respondent's log Bayes factor for a taste over a coin averages
  -0.1 to +0.09 on 15-30 items x 4 answers (a coin flipper's, -0.5 to -1.1);
  46-55% of honest people fall below zero. The selector
  asks the pairs it is least sure of, so the answers carry little sign of
  consistency, which is the anchor section's finding (AUC 0.56-0.72 without
  anchors) seen from another side. Self-consistency alone cannot carry a
  defence here.
- **As a gate on the agreement drop it halves the camp tax**, on synthetic
  panels (25% camps: -0.001 to -0.010 against -0.009 to -0.027) and keeps
  about three quarters of loo-drop's gain against 40-50% coin flippers. Against
  salience pickers it keeps less (25%: +0.022 to +0.026 against +0.035 to
  +0.037), since they are self-consistent.
- **Real disagreement is common.** With no careless people at all, 18-46% of
  real respondents fall under the 0.2 agreement line, and leaving them out
  costs the pool up to 0.033 (0.007-0.018 under standard). This is the first real-data confirmation that
  agreement must not drop or weight people (`respondentAgreement` stays a note).
- **On real panels the gate works only while honest answers are clean.** If
  real people answer a fifth of pairs at random it still recovers up to +0.062
  with 4 answers per item, costing honest panels nothing measurable; at a third
  random it costs honest panels up to 0.035 and loses ground to coin flippers on
  short sessions.

**Decision.** Not shipped. The gate's cost to camps is smaller but not zero,
and on real panels it turns on how noisy real pairwise answers are, which no
data here measures; the first real survey's answers (item (c)) are what
decide it. `selfConsistency` stays a tested library, unwired, and both scripts
re-run in minutes once real answers exist. The coin-flip cost under staged
stays as recorded in the section above: at most 0.025 when half of a small
panel flips coins, a panel the agreement note already flags.

Caveats: synthetic camps share one second taste; real panels are replayed
rankings (no real pairwise noise, so `--honest-lapse` is a stand-in); two
panels, 11 and 15 items; coin flippers on every answer.


## A heavier-tailed prior for the pairwise intervals (2026-11-12, latest; not shipped)

The empirical-Bayes section left the pairwise intervals on the fixed prior
(sd 2.0, wide, 0.95-0.97 coverage at a half-width of about 2.4 logits) and
named one reason the narrower pooled Gaussian fell short of 95%: "a Gaussian
prior on uniform truth over-shrinks the extreme items". A Student-t prior
is the textbook fix for that, since its pull toward the middle fades for an
item far from it. This section builds it, measures it, and finds the
diagnosis was wrong: the t narrows the intervals further but covers less,
under every shape of truth tried, including the heavy-tailed one it is
meant for.

**Method** (`src/lib/btRefit.ts`, `priorDf` on `refitRatings`,
`sampledEvidence` and `pooledPriorPhi`; tests in `btRefitT.test.ts`). Each
item's score gets an independent Student-t prior with `df` degrees of freedom
and scale phi; `df` Infinity is the Gaussian, so every existing caller is
unchanged. The t's curvature turns negative past |m| = phi sqrt(df), so the
Newton steps use its iteratively-reweighted majoriser (df + 1)/(df phi^2 +
m^2) with the existing halving line search, and the covariance uses the true
curvature at the mode (the majoriser only if that Hessian is indefinite).
The sampled evidence uses the fully normalised t density, so a Gaussian
and a t can be compared on one scale. Tests: the density against the
closed form at df 3 and against numerical integration at df 1, 2.5 and 7;
the mode against a finite-difference gradient of a posterior written out in
the test; the covariance against a finite-difference Hessian; df 1e8
against the Gaussian; the evidence against 2-D quadrature on one pair
answered four ways and exactly log 1/2 on one answer.

**Design** (`scripts/t-prior-interval-sweep.ts`, rows in
`docs/t-prior-intervals-2026-11-12.jsonl`). Synthetic respondent of
`infoGainSim.ts`, 8/15/30 items x 2/4/8 answers per item, lapse 0 and 0.2,
shipped and staged selectors, 40 respondents per cell, seed bases 1000 and
50000 (18 cells per row below). Three shapes of true likes, all with sd
1.155 on the logit scale: uniform (the simulator's own, every earlier
sweep), normal, and Laplace (double exponential: a few items far out, the
case a t prior is for). Priors: the fixed Gaussian; the Gaussian with its sd
from the pooled sampled evidence of an independent panel of 40 with the
same design (as the empirical-Bayes section's `--pool`); t with df 7, 3 and
1 (Cauchy), each with its scale from the same pooled evidence; and "by
evidence", the family (Gaussian, t7, t3 or t1) whose pooled evidence at its
own best scale is highest. Coverage of every pair's 95% interval (full
covariance) / coverage over pairs with an item in the true top or bottom
fifth ("ends") / half-width in logits, honest respondents:

| truth | selector | fixed | Gaussian, pooled | t7, pooled | t3, pooled | t1, pooled | family by evidence | picked g / t7 / t3 / t1 |
|---|---|---|---|---|---|---|---|---|
| uniform | shipped | 0.969 / 0.968 / 2.42 | 0.942 / 0.930 / 1.90 | 0.920 / 0.899 / 1.80 | 0.880 / 0.847 / 1.70 | 0.801 / 0.758 / 1.67 | 0.942 / 0.930 / 1.90 | 18 / 0 / 0 / 0 |
| uniform | staged | 0.948 / 0.947 / 2.34 | 0.866 / 0.830 / 1.63 | 0.812 / 0.762 / 1.54 | 0.755 / 0.697 / 1.50 | 0.751 / 0.711 / 1.68 | 0.864 / 0.827 / 1.62 | 17 / 1 / 0 / 0 |
| normal | shipped | 0.968 / 0.966 / 2.42 | 0.930 / 0.910 / 1.86 | 0.912 / 0.885 / 1.77 | 0.879 / 0.838 / 1.67 | 0.809 / 0.758 / 1.66 | 0.930 / 0.909 / 1.86 | 17 / 1 / 0 / 0 |
| normal | staged | 0.941 / 0.941 / 2.35 | 0.856 / 0.813 / 1.56 | 0.837 / 0.780 / 1.52 | 0.811 / 0.747 / 1.53 | 0.793 / 0.746 / 1.71 | 0.856 / 0.813 / 1.56 | 18 / 0 / 0 / 0 |
| Laplace | shipped | 0.964 / 0.961 / 2.41 | 0.913 / 0.882 / 1.78 | 0.899 / 0.862 / 1.70 | 0.875 / 0.826 / 1.60 | 0.828 / 0.771 / 1.61 | 0.908 / 0.874 / 1.77 | 10 / 4 / 4 / 0 |
| Laplace | staged | 0.922 / 0.924 / 2.35 | 0.888 / 0.853 / 1.69 | 0.882 / 0.839 / 1.62 | 0.871 / 0.821 / 1.61 | 0.855 / 0.810 / 1.75 | 0.883 / 0.842 / 1.67 | 10 / 6 / 2 / 0 |

With careless answers (lapse 0.2) every pooled prior breaks, as the
empirical-Bayes section found for the Gaussian: 0.65-0.77 for the pooled
Gaussian, 0.61-0.77 for the t's, against 0.88-0.93 for the fixed prior.
Rank accuracy moves by 0.01 at most between any two priors in any row.

What it shows:

- **The t covers less than the Gaussian of the same evidence, under every
  truth.** Each step to a heavier tail (Gaussian, t7, t3, t1) costs coverage
  on shipped in every row, 0.01-0.08 per step, and buys at most 0.10
  logits of width per step. Under staged the order is the same except t1, whose Cauchy scale
  sometimes lands wider. Even with Laplace truth the t3 holds 0.875 and
  0.871 against the Gaussian's 0.913 and 0.888.
- **The ends were never the main miss.** Pairs with an item in the top or
  bottom fifth do miss more than the rest under the pooled Gaussian, but by
  0.01-0.04, and the t widens that gap rather than closing it (t3 ends
  0.03-0.06 under t3 overall).
- **Why.** A heavier-tailed prior with the same spread is more peaked in
  the middle. Its curvature at 0 is (df + 1)/(df phi^2), and the pooled
  evidence gives it a smaller scale than the Gaussian's sd (on uniform truth
  under shipped: Gaussian 1.06-1.37, t3 0.82-1.06; under staged with 8
  answers per item the t3 scale falls to 0.34-0.80), so most items, which sit
  in the middle, are pulled together harder and their Laplace intervals read
  as more certain than the answers make them. The long tail helps the one
  or two items far out; the peak costs every other pair.
- **The evidence knows.** Choosing the family by pooled evidence picks the
  Gaussian in 90 of 108 honest cells (35 of 36 on uniform truth; 20 of 36
  on Laplace) and ends within 0.005 of the pooled Gaussian everywhere, so the
  data do not ask for heavier tails even when the truth has them.
- **The pooled Gaussian is not safe for intervals either.** On seed base
  50000 the staged 15 items x 8 answers cell's pooled sd fell to 0.33 (near
  the 0.3 floor) and its intervals held 0.39 of pairs; the staged rows
  above are 0.86-0.89 rather than the empirical-Bayes section's 0.926
  (seed base 1000 only, 8/15/30) for that reason. On seed base 1000 alone
  the staged honest uniform cells give 0.88-0.95, matching it. The favourite
  set is not hurt by such a collapse, since it takes the narrower of own and
  stored sd and a narrower sd only lengthens the list.

**Decision.** Not shipped. The pairwise intervals keep the fixed Gaussian
prior, which is the only prior here that holds 0.92 or better in every honest
row and 0.88 or better with careless answers. `priorDf` stays in `btRefit.ts`, tested and
unwired (no caller passes it), so a later prior experiment can reuse it.
Next for the intervals, if they are to get narrower: why the pooled
Gaussian panel collapses under staged with many answers per item (a
hyperprior on phi, or more than 40 people, are the obvious tries) and
intervals from posterior draws rather than Laplace curvature, since staged
asks exactly the pairs whose posterior is least Gaussian.

Caveats: synthetic Bradley-Terry respondents; three chosen truth shapes,
not measured ones; 30 items or fewer; 40 respondents per cell, so a cell's
coverage moves by about 0.01-0.02 between seed bases (and by more when a
pooled estimate collapses). The PrefLib panels give real orderings but no
true logit gaps, so pairwise intervals on them cannot be scored; real
pairwise answers would not either, which is why this stays a simulation
question.

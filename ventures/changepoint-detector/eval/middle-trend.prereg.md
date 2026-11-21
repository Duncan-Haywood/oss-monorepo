# Pre-registration: a Middle that allows for growth (2026-11-21)

Written and committed before any run of `eval/middle-trend.mjs` on the seeds below. The script was smoke-run with
`SEED_SHIFT=8500 NSEEDS=1` (wiring only) and probes on seeds 9101-9108 and 9200 (`/tmp` scratch, below); those seeds
decide nothing and are not reused.

**Why.** README "Middle as the count default? No" (2026-11-21): Middle (`COUNT_MIDDLE`, `pelt` + NB cost) is the
better watch on falls by about 17 days unaware per fall, but PELT with a flat level between changes fits a steady
climb as a staircase, so on sites growing 30% over 240 days it alerted on 20 of 40 against the count default's 1
(bar G6 failed). That README section named the next try: a Middle that allows for a trend.

**The candidate, MR.** `COUNT_MIDDLE` plus `trend: 'robust'` (new, `presteps.mjs`): on each check, one log-linear
growth rate across the window is read from the median of the log-count slopes over a quarter of the series (the
starting estimate `poissonTrend` already computes) and held fixed as the exposure under PELT + NB. **It is kept only
when it earns its place**: the penalised cost with it must beat the flat penalised cost (same NB size) by log n, one
parameter by BIC. Otherwise the check runs exactly as Middle does.

Why the gate: in the wiring probe an ungated version (the slope always applied) alerted 3, 1 and 1 times on three
flat sites where Middle sent 2, 0 and 0, because a slope that is slightly wrong is patched with steps; gated, it sent
2, 0 and 0. On an 8-seed probe (seeds 9101-9108, base 400, cv 0.15) gated MR heard the same eight 20% falls on the
same days as Middle and sent no null alert, as Middle, but cut alerts on sites growing 30% only from 6 to 4, so H1 may
well fail; the round decides. A known weakness, seen before the round: a 40% fall late in a growing series biases the robust slope
(0.34 read against 0.80 true on one series), the gate then rejects it and MR falls back to Middle's staircase. Cell
T6 below is added to report that case.

**Why not the full joint fit (`trend: true`).** `poissonTrend` alternates PELT with Newton steps on the growth rate,
up to 12 passes. Timed here at about 0.2 s per check on a 240-day window against 0.04 s for Middle, so this round's
3,360 series would take about 47 core-hours. On the 6-seed probe it alerted on 1 growing site against Middle's 4
and heard all 6 20% falls (days 4, 37, 10, 10, 8, 16 against Middle's 4, 38, 8, 10, 5, 8), so it stays a candidate
for a later, smaller round. MR's one PELT under a non-constant exposure is itself slower than Middle (the NB cost
with exposures is O(segment length)); this round measures it on four cores.

**Arms.** D: `COUNT_DEFAULTS`. M: `COUNT_MIDDLE`. MR: as above. All `--model poisson`, watch defaults otherwise,
replayed each day, paired by seed. The three sets, generators and scoring are those of
`eval/count-default-middle.prereg.md`, unchanged, on **fresh seeds**: set 1 **1501-1540**, set 2 **4001-4200**,
set 3 **1701-1740**. Set 3 gains a reported cell, **T6**: grows 30% over 240 days and falls 20% on day 180 (heard,
days unaware and false alerts before the fall, scored as set 1).

**Bars against Middle (H): does MR replace `COUNT_MIDDLE`?**
- H1: set 3 T1 (growing 30% over 240 days): MR's alerts per 1,000 days at most D's + 3.0 (the bar Middle failed).
- H2: set 1, at each cv: mean days unaware over the nine fall cells, MR minus M, the upper end of the 95% paired
  bootstrap interval (10,000 resamples within cells) at most +2.0 (MR gives back at most two days per fall).
- H3: set 1, at each cv: MR's pooled false alerts at most 2.0 per 1,000 days.
- H4: set 2: pooled false alerts per 1,000 checks (nulls weighted equally), MR minus M, upper end of the stratified
  paired interval at most +0.5; steps found of 1,200, MR minus M, lower end at least -24 (2%).

**Bars against the default (G): does MR replace `COUNT_DEFAULTS`?** G1-G6 of `eval/count-default-middle.prereg.md`
with MR in M's place, unchanged: G1 MR false <= 2.0 per 1,000 days at each cv; G2 days unaware MR - D upper < 0 at
each cv; G3 40% falls MR <= D + 1.0 days at each cv; G4 set 2 false MR - D upper <= 1.0 and no null cell worse by
more than 2.0; G5 set 2 steps MR - D lower >= 0 and no step cell more than 4 fewer of 200; G6 = H1.

**Decision.**
- All H pass: `COUNT_MIDDLE` becomes MR, so the page's "Middle" for counts, the count hint's middle rung and
  `--detector auto` use it; the hint's note and the watch page drop or reword the warning that Middle alerts on
  growth, by what T1-T5 show.
- All H and all G pass: `COUNT_DEFAULTS` also becomes MR (the old default stays on the ladder as Quiet).
- Any H fails: `COUNT_MIDDLE` and the default stay; `--trend robust` ships as a documented option for counts on the
  analysis CLI and the watch (`--trend robust`), with this round's numbers beside it, and the README names the
  failed bar.

**Reported, deciding nothing.** T2-T6 for all arms; UCI Online Retail's daily orders (`eval/count-default-middle-shop.mjs`'s
replay) under the three arms if time allows.

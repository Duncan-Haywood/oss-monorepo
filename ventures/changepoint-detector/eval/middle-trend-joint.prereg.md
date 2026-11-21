# Pre-registration: the joint growth fit, gated, as the count Middle (2026-11-21)

Written and committed before any run of `eval/middle-trend-joint.mjs` on the seeds below. The script was smoke-run
with `SEED_SHIFT=8500 NSEEDS=1` (wiring only). Probes on seeds 9301-9318 and 9401-9408 (`eval/middle-trend-why.mjs`
and scratch scripts) decide nothing and are not reused.

**Why.** README "A Middle that allows for growth" (2026-11-21): MR (`--trend robust`, one growth rate read from a
robust slope and held under PELT + NB, kept by a log n gate) cut Middle's alerts on sites growing 30% over 240 days
from 31 of 40 to 23 of 40 but failed bar H1 (6.25 alerts per 1,000 days against a limit of 3.83). That section named
the full joint fit (`--trend`) as the next try, and left "why" unmeasured.

**What the probes showed.** `eval/middle-trend-why.mjs` on T1 seeds 9301-9303: MR's gate kept the growth term on 57,
87 and 103 of 121 daily checks and **flipped 25, 21 and 11 times**; on a check where it is left out, PELT fits the
climb as a staircase and a new step alerts. The robust slope (median of lag-n/4 log differences) is noisy at the
margin of the log n gate. The joint fit re-estimates the growth under the steps, so its cost with growth is lower and
the gate margin wider. On T1 seeds 9301-9318: Middle alerted on 13 of 18 series, MR on 3 of 8 (9311-9318),
the ungated joint fit (J) on 2 of 10 and 1 of 8, the gated joint fit (JG) on 1 of 8. On flat probe sites (set 2 N2
and N5, seeds 9401-9408; gsc base 400 cv 0.15 no fall, seeds 9401-9408) total alerts were M 3/3/1, J 4/3/3, JG
3/2/1: the ungated fit adds alerts on flat sites, as the ungated robust version did in the last round, so the gate
stays. Timing: about 0.1 s a check for the joint fit (the last round guessed 0.2 s), 2.5x MR.

**The candidate, JG.** `COUNT_MIDDLE` plus `trend: true, trendGate: true` (new engine option): `poissonTrend`
alternates PELT + NB under the current exposure with Newton steps on one log-linear growth rate (up to 12 passes, as
`--trend` already does for counts), and the growth term is kept only when that fit's penalised cost plus log n beats
the flat PELT + NB cost (the gate MR uses, same NB size). Otherwise the check runs exactly as Middle does.

**Arms.** D: `COUNT_DEFAULTS`. M: `COUNT_MIDDLE`. MR: `--trend robust` (reported beside, not a candidate). JG as above.
All `--model poisson`, watch defaults otherwise, replayed each day, paired by seed. Sets, generators and scoring are
those of `eval/middle-trend.prereg.md` unchanged (set 3 with T6), on **fresh seeds** and, for time, fewer of them in
sets 1 and 2: set 1 **2501-2520** (20 per cell), set 2 **5001-5060** (60 per cell), set 3 **2701-2740** (40 per
cell). Bootstrap seed 20261123, 10,000 resamples.

**Bars against Middle (H): does JG replace `COUNT_MIDDLE`?** As `eval/middle-trend.prereg.md` with JG for MR:
- H1: set 3 T1: JG's alerts per 1,000 days at most D's + 3.0.
- H2: set 1, at each cv: mean days unaware over the nine fall cells, JG minus M, upper end of the 95% paired bootstrap
  interval at most +2.0.
- H3: set 1, at each cv: JG's pooled false alerts at most 2.0 per 1,000 days.
- H4: set 2: pooled false alerts per 1,000 checks (nulls weighted equally), JG minus M, upper end at most +0.5; steps
  found, JG minus M, lower end at least -2% of the steps (-7 of 360).

**Bars against the default (G).** G1-G6 of `eval/count-default-middle.prereg.md` with JG in M's place, except G5's
per-cell limit scaled to the seed count: no step cell more than 2 fewer of 60 (was 4 of 200).

**Decision.**
- All H pass: `COUNT_MIDDLE` becomes JG, so the page's "Middle" for counts, the count hint's middle rung and
  `--detector auto` use it, and the hint's note and the watch page reword the warning that Middle alerts on growth by
  what T1-T5 show.
- All H and all G pass: `COUNT_DEFAULTS` also becomes JG.
- Any H fails: nothing moves; the gate ships as `--trend-gate` beside `--trend` for counts, with this round's numbers
  and the failed bar named in the README.

**Known risks, written down before the runs.** Set 1 at 20 seeds a cell gives wider intervals than last round's 40,
which makes H2 harder to pass, not easier. A wandering level (T4, T5) is not a line; JG is not expected to help there,
and the bars do not ask it to. The gate can still flip on a check whose margin sits at log n.

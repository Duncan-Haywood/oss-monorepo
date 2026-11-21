# Pre-registration: Middle (`pelt` + NB cost) as the count watch default? (2026-11-21)

Written and committed before any run of `eval/count-default-middle.mjs` on the seeds below. The script was smoke-run
on seeds 9001-9002 only (wiring; those seeds decide nothing and are not reused).

**Why.** README "A middle setting for over-dispersed counts" (2026-11-21) shipped Middle (`COUNT_MIDDLE`, `pelt` with
the negative-binomial cost) as a named setting and a rung of the count hint, and found that in stage C **Middle alone,
with no hint, did best of all** (1.53 false alerts per 1,000 checks and 1,140 of 1,200 steps, against the count
default's 0.72 and 1,056). That round did not test making it the default, and Middle is slower on the falls both hear
(a median of 8 days on a 20% fall against 5). A default faces every series a deployer brings, including ones that
grow, so this round weighs the delay and tries series the earlier rounds did not have.

**Arms.** D: today's count default (`COUNT_DEFAULTS`: `bocpd-window`, NB cost, threshold 0.3). M: `COUNT_MIDDLE`.
Both `--model poisson`, watch defaults otherwise (confirm, tolerance and persist as shipped), replayed each day.

**Days unaware**, the single number that weighs delay against misses: for a series with a fall on day 180 watched to
day 239, the days from the fall to the first alert that hears it (an alert dated within 7 days of day 180 and reported
on or after it), or **60** when no alert hears it. A slower alert costs its extra days; a miss costs the whole window.

**Set 1, simulated Search Console sites** (`eval/gsc-sites.mjs`, unchanged; fresh seeds **501-540**; cv 0.15 and 0.30;
base 50/400/3,000 clicks a day; falls 0/10/20/40% on day 180).
- G1: M's pooled false alerts (every alert on a no-fall series, and those reported before day 180 on the others) at
  most 2.0 per 1,000 days at each cv.
- G2: at each cv, mean days unaware over the nine fall cells, M minus D: the upper end of the 95% paired bootstrap
  interval (10,000 resamples, seeds resampled within each cell) below 0.
- G3: at each cv, mean days unaware on the 40% falls, M at most D + 1.0.

**Set 2, the eleven cells of the count hint round** (`eval/gsc-middle-hint.mjs`'s generators and scoring, a step
found when an alert is dated within 3 points of 180; fresh seeds **3001-3200**), fixed M against fixed D.
- G4: pooled false alerts per 1,000 checks (nulls weighted equally), M minus D: the upper end of the 95% stratified
  paired bootstrap interval at most 1.0, and no null cell worse by more than 2.0.
- G5: steps found of 1,200, M minus D: the lower end of the interval at least 0, and no step cell more than 4 fewer of
  200.

**Set 3, growing and wandering sites** (new; base 400 clicks a day, weekends at 70%, gamma day multiplier cv 0.15,
seeds **701-740**, 240 days, watched from day 120, no step). T1 the mean grows linearly by 30% over the 240 days; T2
by 100%; T3 falls linearly by 30%; T4 log-mean random walk, sd 0.01 a day; T5 the same, sd 0.02.
- G6: on T1 (a gently growing healthy site, the commonest case a default meets), M's alerts per 1,000 days at most
  D's + 3.0. T2-T5 are reported, not barred: there is no agreed right answer for alerts on a strong trend or a wander.

**Decision.** G1-G6 all pass: `COUNT_DEFAULTS` becomes M; today's default stays on the ladder as Quiet for counts
(the ladder's three settings are unchanged, only the no-option default moves), the README, the watch page and
`llms.txt` say so, and tests pinned to the old default name it explicitly. Any bar fails: the default stays, Middle
stays a named setting and a hint rung, and the README names the failed bar.

**Reported, deciding nothing.** The real count series the tests already carry (UCI Online Retail's daily orders in
`real-shop.test.mjs`), alerts under D and M.

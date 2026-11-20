# Pre-registration: the "How eager" hint for counts with the count default as Quiet (2026-11-20)

Written and committed before `eval/watch-eagerness-counts.mjs` was run on seeds 1001-1200. The script was smoke-run
once on seeds 1-4 (4 per cell) to time it and check the wiring; those seeds decide nothing and are not reused.

**Why.** "A count default for clumped orders" (README, 2026-11-20) made `bocpd-window` with the negative-binomial cost
at alert threshold 0.3 the watch's default for `--model poisson`, but left the "How eager" ladder alone: for counts,
`--suggest` and `--detector auto` still pick between `bocpd` (Quiet) and `pelt` (Eager). `--detector auto` stores the
pick as a named detector, so a deployer who follows the workflow's suggested `WATCH_OPTIONS="--detector auto
--alerts-per 1/month"` on a count column is never given the new default: a quiet history stores `bocpd`, which is
exactly the old default.

**Arms.** All on `--model poisson`, confirm 5, tolerance 5, persist 2 (the shipped policy).

- BASE, today's hint: ladder (`bocpd`, `pelt`), round 6's rule at budget 2 alerts per 100 checks.
- CAND, the new hint: ladder (count default, `pelt`), the same rule and budget.
- Reported only: ladder (count default, `bocpd`, `pelt`); fixed count default; fixed `bocpd`.

**Design.** The eleven cells and generator of `eval/poisson-window-threshold.mjs` (five nulls, six steps), 240 daily
points per series, 200 seeds per cell (1001-1200), paired across arms. The hint sees the first 120 points only
(`eagernessReplay`, which replays them from point 24). The picked setting is replayed as a watch over the whole series
from point 120 and scored on those 120 checks: in the nulls, false alerts per 1,000 checks; in the step cells, a step
at point 180 (the history is all before it), found when an alert's change lies within 3 points of 180.

**Bars, CAND against BASE** (the four of the count-default rounds, with the same stratified paired bootstrap, 10,000
resamples): F1 the upper end of the 95% interval for the pooled false-alert difference (nulls weighted equally) at or
below 1.0 per 1,000 checks; F2 no null cell worse by more than 2.0 per 1,000; D1 the lower end of the interval for
the pooled steps-found difference above 0; D2 no step cell finds more than 4 fewer of 200.

**If it passes.** For `--model poisson` with no `--overdispersion` or threshold named, the ladder becomes (count
default, `pelt`): `--suggest` prints the count default as Quiet, `--detector auto` stores it with its cost and
threshold so later runs keep it, and the page's "Use Quiet" button keeps the count default. A state file that already
stores `bocpd` keeps it (the person's earlier pick). **If it fails**, the ladder stays, the table goes in the README,
and the next item says which bar failed.

Read in advance: `pelt`'s history rate is the same in both ladders, so the two hints pick Eager on the same series and
differ only where Quiet is picked. The round therefore measures the count default against `bocpd` on the series whose
history was too busy for `pelt`, which leans clumped. A pass is likely from the earlier rounds; the bars are kept so a
loss on those series would show.

# Pre-registration: the clumping-corrected window with a lower alert threshold (2026-11-20)

Written and committed before `eval/poisson-window-threshold.mjs` was run on any seed below.

**Why.** `eval/poisson-window-clumping.out.txt` (seeds 401-600, pre-registered) failed one bar: `bocpd-window` with the
negative-binomial cost (C1) cut the pooled false alerts by 2.68 per 1,000 checks (2.06 to 3.32) and heard 205 more of
1,200 steps, but on the clumpiest step cell (S6, NB variance 3x the mean, 30 to 18, a 40% drop) it heard 103 of 200
against `bocpd`'s 126. `bocpd`'s 126 is bought with 10.81 false alerts per 1,000 checks on the matching null (N5); C1
paid 0.16 there. C1 is quieter than it needs to be on clumped counts: the NB cost made its posterior honest, and the
alert threshold (0.5, chosen for the plain cost) was never revisited. The rule here spends part of the false-alert
headroom on power by lowering the threshold the windowed probability must reach.

**Arms.** Today's default `bocpd` (Poisson cost, threshold 0.5), and C1 (`bocpd-window`, `overdispersion: 'nb'`) at
thresholds T in {0.5, 0.4, 0.3, 0.25, 0.2}. Nothing else changes (confirm 5, tolerance 5, persist 2, hazard 100).

**Design.** The eleven cells, generator and scoring of `eval/poisson-window-clumping.prereg.md` (120 daily points,
checks from point 90, a step at 108 found by an alert within 3 points, paired series), the same four bars against
`bocpd`: F1 the upper end of the 95% stratified paired bootstrap interval for the pooled false-alert difference (nulls
weighted equally) at or below 1.0 per 1,000 checks; F2 no null cell worse by more than 2.0; D1 the lower end of the
interval for the pooled steps-found difference above 0; D2 no step cell finds more than 4 fewer of 200.

**Stage A, tuning (seeds 601-800).** Every T is run. T\* is the **highest** T at which C1 passes all four bars. If no
T passes, the round fails here, stage B is not run, and nothing changes.

**Stage B, test (fresh seeds 801-1000).** C1 at T\* only, against `bocpd`, the same four bars, once.

**If stage B passes, what changes.** The watch's `--model poisson` default becomes `bocpd-window` with the NB cost at
threshold T\*, on the one-column watch and per count column; naming a detector or `--overdispersion` keeps today's
behaviour for that column (an explicit `--detector bocpd` gets threshold 0.5 and the Poisson cost). The guide page,
llms.txt and README say so with these numbers. **If it fails**, the default stays `bocpd`, the table is reported in
the README, and the next item says which bar failed.

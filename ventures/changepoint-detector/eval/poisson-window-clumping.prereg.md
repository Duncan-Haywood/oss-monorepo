# Pre-registration: the windowed detector for counts with a clumping correction (2026-11-19)

Written and committed before `eval/poisson-window-clumping.mjs` was run on any seed below.

**Why.** `eval/poisson-window-margin.out.txt` (seeds 201-400, pre-registered) failed the margin: `bocpd-window` cost
3.26 more false alerts per 1,000 checks than `bocpd` (95% interval 2.68 to 3.87), against a margin of 1.0. Almost
all of it came from the clumped nulls: +0.32 on Poisson 30, +0.48 with weekends, 0.00 on Poisson 5, but +4.19 on a
negative binomial with variance 2x the mean and +11.29 at 3x (where `bocpd` itself gave 11.29 per 1,000). The watch
scores counts with a Poisson likelihood, which treats clumping as evidence of change; the window sums that evidence
over five neighbours and so pays more for it. The engine already has two corrections for clumped counts that its
Bayesian pass honours (`bocpd`'s `dispersion` and `nbSize`, engine.mjs), and the watch passes engine options
through, but the watch has never been measured with either.

**Candidates** (each as the `--model poisson` watch default, compared with today's default `bocpd`, no correction):
- **C1** `bocpd-window` with `overdispersion: 'nb'`: a negative-binomial size estimated from the watched window at
  each check (beta-negative-binomial predictive in `bocpd`; Poisson-like data give no clumping and the plain cost).
- **C2** `bocpd-window` with `overdispersion: true`: a quasi-likelihood dispersion phi estimated from the window
  (`countDispersion`), the Poisson likelihood tempered by 1/phi.

Also reported, not decided on: `bocpd-window` with no correction (the last round's arm) and `bocpd` with
`overdispersion: 'nb'`.

**Design.** Identical to `eval/poisson-window-margin.prereg.md` (the same eleven cells, 120 daily points, checks from
point 90, a step at 108 found within 3 points, paired series, the same generator), on **fresh seeds 401-600**.

**Rule.** A candidate passes if, against `bocpd`, all four hold (the margin round's rule, unchanged):
F1 the upper end of the 95% stratified paired bootstrap interval for the pooled false-alert difference (nulls
weighted equally) is at or below 1.0 per 1,000 checks; F2 no null cell's difference is above 2.0; D1 the lower end of
the interval for the pooled steps-found difference is above 0; D2 no step cell finds more than 4 fewer of 200.
If both pass, the one with the lower pooled false-alert rate is chosen. If neither passes, the default stays `bocpd`.

**If one passes, what changes.** The watch's count default becomes that detector and correction; `--overdispersion`
becomes a watch option (CLI and per column) so a deployer can turn it off; the guide page, the made repository's
README, the workflow comment and llms.txt say so. **Whatever the result**, the guide and docs replace "about one more
false alert in 600 days" for the opt-in window with the margin round's measured cost, split by clumping.

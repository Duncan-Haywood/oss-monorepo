# Pre-registration: a middle "How eager" setting for over-dispersed counts (2026-11-21)

Written and committed before the tuning and fresh runs below. Before writing it, five candidates were smoke-run on
seeds 101-110 of `eval/gsc-middle-sweep.mjs` at cv 0.15 to check the wiring and see whether any middle exists (it
does: `pelt` with the negative-binomial cost and the windowed pass at threshold 0.1 both heard most 20% falls with a
few false alerts per 1,000 days). Those seeds are reused in tuning below (101-120), which is the stage that may be
looked at; the fresh seeds (301-340, and 2001-2200 in stage C) have not been run.

**Why.** "Google Search Console as a source" (README, 2026-11-21): on simulated sites whose daily clicks swing beyond
Poisson, the count default (Quiet) misses most 20% falls and nearly all 10% ones, while Eager (`pelt`, Poisson cost)
sends 39-148 false alerts per 1,000 days. The count ladder has no step between them, so a site owner who wants 20%
falls heard has nothing to choose, and the hint (`--suggest`, `--detector auto`) falls back to Quiet on every
over-dispersed history because `pelt` is over budget there.

**Candidates** (all `--model poisson`, confirm 5, tolerance 5, persist 2): M1 `pelt` + `--overdispersion nb`; M2
`pelt` + `nb1`; M3 `bocpd-window` + `nb`, threshold 0.2; M4 the same at 0.1; M5 the same at 0.05.

**Stage A, tuning** (seeds 101-120, cv 0.15 and 0.30 of the gamma day multiplier; 12 cells each: 50/400/3,000 clicks a
day, falls 0/10/20/40% on day 180). A fall is heard when an alert dated within 7 days of day 180 is reported on or after
it. Eligible: pooled false alerts (every alert on a no-fall series, and those reported before day 180 on the others)
at most 2.0 per 1,000 days watched, at each cv separately. Pick: the eligible candidate hearing the most 10% and 20%
falls summed over both cvs; tie, the smaller median delay on 20% falls. None eligible: the item fails here and the
README says so.

**Stage B, fresh sites** (seeds 301-340, both cvs), the pick against Quiet (the count default): G1 pooled false alerts
at most 2.0 per 1,000 days at each cv; G2 at cv 0.15, at least 30 more of the 120 20% falls heard than Quiet; G3 the
median delay on 40% falls at most Quiet's plus 1 day, at each cv.

**Stage C, the hint with a middle rung** (only if B passes). `eval/watch-eagerness-counts.mjs`'s eleven cells and
scoring, 200 fresh seeds (2001-2200), CAND = ladder (count default, pick, `pelt`) against BASE = today's ladder
(count default, `pelt`), at round 6's budget. Bars as that round's: F1 the upper end of the 95% paired bootstrap
interval for the pooled false-alert difference at most 1.0 per 1,000 checks; F2 no null cell worse by more than 2.0;
D1 the lower end of the steps-found difference interval at least 0 (the middle should not lose steps; most cells are
near 200 of 200, so a strict gain is not required); D2 no step cell more than 4 fewer of 200.

**What ships.** B passes: the pick is offered as a named setting for counts (watch card, CLI words, README), whatever
C says. B and C pass: it also becomes the Middle rung of the count ladder, so `--suggest`, `--detector auto` and the
page's hint can choose it. B fails: nothing ships but the tables, and the next item names the failed bar.

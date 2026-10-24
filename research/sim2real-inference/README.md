# Sim-to-real inference: how few real trials certify a robot policy when a biased simulator supplies the rest?

**Status: open research programme, milestone 4 of 7 started: SIMPLER policy-level real data logged (3b to 3e follow-ups also logged).** First results below: on 21 MuJoCo twin-real model pairs, context-paired twin runs multiply the effective real sample by up to 3.2x and match the closed form 1/(1 - rho^2 (1 - n/N)) within 6%, unpaired twin runs give none, and plug-in 95% intervals undercover (hypothesis H1 refuted as pre-registered). This directory is where
the work toward one publishable paper accumulates across sessions; it consolidates about 130
small twin projects in this repository into one question (see [`PROPOSAL.md`](PROPOSAL.md)).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/sim2real-inference/

**The question.** A digital twin (a simulator of a real robot) is biased, so evaluating a policy on
the twin alone gives the wrong answer however many runs you make. Real trials are unbiased but
scarce. The programme asks for estimators and tests that use many twin runs and a few real ones,
keep their guarantee *whatever* the twin's bias, and say exactly how many real trials they save:
for a policy's mean return, its failure rate, and comparisons between policies.

**Why it is open.** Control-variate and prediction-powered inference arguments promise savings that
grow with the twin's correlation with reality; a worst-case argument (`twin-certification`) says a
twin cannot shorten a failure-rate certificate at all. The programme looks for the checkable
assumptions in between, and tests them on real paired sim and real data (SIMPLER, Li et al. 2024) as
well as on MuJoCo model pairs.

- [`PROPOSAL.md`](PROPOSAL.md): question, related work (13 checked references), gap, hypotheses
  H1 to H6, method, evaluation, milestones, target venue.
- [`src/sim2real_inference/`](src/sim2real_inference): milestone 2, one estimator library (real-only,
  PPI, PPI++, classical control variate, optimal allocation, exact failure-rate threshold test) and
  [`tests/`](tests) that reproduce numbers from `twin-evaluation`, `twin-pilot` and
  `twin-certification` (0.072 and 0.172 cost-ratio thresholds, `rho*(0.05)` = 0.426, context-share
  equivalents 1.04/1.33/2.78 and 1.25/2.0/5.0, the 299-trial zero-failure test) and check the
  variance formulas and interval coverage by simulation. Run:
  `PYTHONPATH=src python3 -m unittest discover -s tests` (11 tests, about 14 s); the benchmark tests are `tests/test_benchmark.py` (needs numpy and mujoco).
- [`experiments/m3_benchmark/`](experiments/m3_benchmark): milestone 3, the benchmark. `pairs.py` (a MuJoCo pendulum arm; twin = nominal, "real" = disturbance plus one omitted effect: friction, delay, sensor noise, actuator gain, payload mass, each at four swept magnitudes), `run_pool.py` (4 minutes on 4 cores), `analyse.py` (H1, H2, H6, about 5 minutes), `figure.py`. Results in [`results/`](experiments/m3_benchmark/results): `summary.txt`, `coverage.csv`, `h2.csv`, `h6.csv`, figure below.
  Model-versus-model pairs, never real-robot results; magnitudes are swept, not from a datasheet.

![E against paired correlation, and coverage](experiments/m3_benchmark/results/e_vs_rho.png)

  Left: effective-sample multiplier E (variance of real-only over variance of the control variate, n = 30 pairs plus 270 twin-only runs) against the paired correlation; line is the closed form. Right: coverage of 95% intervals, n = 30. Results: H1 refuted (intervals undercover, partly because the bounded outcome is skewed and real-only undercovers too, 91.2% at worst); H2 supported on 13 of 21 pairs and failing where rho is under about 0.75; H6 mixed (rho predicts value better, Spearman 0.999, but detectability predicts it too, -0.95). Full account in [`LOG.md`](LOG.md).
- [`experiments/m3b_intervals/`](experiments/m3b_intervals): milestone 3b, finite-sample intervals. `intervals.py` (about 3 minutes on 4 cores) compares the plug-in t, percentile-bootstrap and studentised-bootstrap intervals for `cv` and `ppi_pp` on the same pools. Result: the studentised bootstrap lifts mean coverage at n = 30 from 92.0% to 93.6% (`cv`) with a worst pair at 90.8%, at 14% greater width; the percentile bootstrap is worse than t. Pre-registered H1b and H1c were both refuted; see [`LOG.md`](LOG.md) and `results/summary_3b.txt`.
- [`experiments/m3c_dfree/`](experiments/m3c_dfree): milestone 3c, a distribution-free interval. `dfree.py` (about 1 minute) builds an empirical-Bernstein interval for the control-variate estimand (lam from a third of the pairs, union bound over the residual mean and the twin mean) and compares it with a real-only empirical-Bernstein interval. Result: both cover 100% on all 21 pairs, but the control-variate interval is 2.1 to 3.1 times wider, because the bound is dominated by its range term (0.146 against a variance term of 0.027 on `none-0`, n = 60). A betting or observed-range interval is the next route; see [`LOG.md`](LOG.md) and `results/summary_3c.txt`.
- [`experiments/m3d_betting/`](experiments/m3d_betting): milestone 3d, a betting (hedged-capital) interval. `betting.py` (about 2 minutes) repeats 3c with the Waudby-Smith and Ramdas interval. Result: valid (coverage at least 99.5%) but again 2 to 3.4 times wider with the twin than without (mean 2.9 at n = 60); the plug-in bet cap binds on 99 to 100% of bets, so the width stays range-limited. Range-free routes are the next step; see [`LOG.md`](LOG.md) and `results/summary_3d_prior*.txt`.
- [`experiments/m3e_bounded_disc/`](experiments/m3e_bounded_disc): milestone 3e, a bounded-discrepancy lower bound (pilot-checked bound on |R - T|). `bounded.py` (seconds) compares it with a real-only empirical-Bernstein bound at n up to 240. Result: valid (100% coverage) but tighter on 0 of 21 pairs at every n; the pilot maximum of |R - T| stays near 0.3 and the check costs gamma = 0.056 at n = 240, so the proposal's H3 is refuted for a max-based bound here. See [`LOG.md`](LOG.md) and `results/summary_3e.txt`.
- [`experiments/m4_simpler/`](experiments/m4_simpler): milestone 4, real data. `data.py` holds SIMPLER's published paired real and SAPIEN success rates (Li et al. 2024, arXiv:2405.05941, Tables IV and V; 36 policy-task cells), `analyse.py` (seconds) asks how many real trials the twin is worth. Result: raw sim error is 5x the real-only variance; a leave-one-cell-out calibrated twin has RMSE 0.12 and a break-even of about 10 real trials [5, 26]; rank correlation is r = 0.90. Policy-level only, so the paired control variate (H1, H2) is untested on real data. See [`LOG.md`](LOG.md) and `results/summary_4.txt`.
- [`LOG.md`](LOG.md): the research log. Hypotheses are written down before experiments are run.
- How runs work on a programme: [`../PROGRAMMES.md`](../PROGRAMMES.md).

Produced with AI assistance (Claude Code). It builds on published work it cites and implies no
affiliation with or endorsement by any author or lab.

## Owner steps

- Real-robot trials, if a later milestone needs them, and submitting the paper (publishes under a
  name).

## Outside dependencies

MuJoCo (open source, pip) and numpy for the benchmark; planned: the published SIMPLER tables.
- [`experiments/m3f_failure_rate/`](experiments/m3f_failure_rate): milestone 3f, failure-rate certificates. `failrate.py` (seconds) compares a twin-informed upper bound on the failure rate (twin failure rate plus the exact bound on P(real fails, twin passes)) with Clopper-Pearson on the 21 pools; `breakeven.py` gives the plug-in break-even. Result: valid (coverage at least 98.6%) but tighter on 0 of 21 pairs at every n (n = 240: gap 0.056 against 0.041), because even the best twin passes about 55% of the real failures; it would need q10/p of roughly 0.04 to 0.10. H3 refuted in this benchmark. See [`LOG.md`](LOG.md) and `results/summary_3f.txt`.
- [`experiments/m5a_active/`](experiments/m5a_active): milestone 5a, active selection of real trials (H4). `active.py` (about 20 minutes on 4 cores) samples contexts for the real trials in proportion to a gradient-boosting prediction of the twin error |R - T| (an n/3 uniform pilot fits it), with an unbiased inverse-probability weight. Result: at n = 120 it cuts MSE against uniform by 17 to 35% on the three pairs where the twin error is predictable from the context (het_r2 above 0.45), is 8% worse in the median on the weakly predictable pairs, and at n = 30 to 60 loses on 18 to 19 of 21 pairs. Coverage is 92.4% at worst. See [`LOG.md`](LOG.md) and `results/summary_5a.txt`.
- [`experiments/m5b_anytime/`](experiments/m5b_anytime): milestone 5b, anytime confidence sequences. `anytime.py` (about 1 minute) runs hedged-capital sequences for real-only and for the twin as control variate (paired difference, or pilot-fitted lambda) and measures coverage under optional stopping and the number of real trials until a decision. Result: valid (miss at most 2.5%) but the twin is slower, 74 against 50 median trials at gap 0.10, on all 12 pairs with rho at least 0.8 (H5 refuted). See [`LOG.md`](LOG.md) and `results/summary_5b.txt`.

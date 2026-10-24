# Proposal: valid sim-to-real inference for robot policies

Programme `sim2real-inference`, opened 2026-10-24. Written with AI assistance
(Claude Code); results are reported only as the code produces them. This is a
plan, not a result: nothing below has been measured yet unless it cites an
existing project in this repository.

## Question

How few real trials does it take to certify a property of a robot policy
(its mean return, its failure rate, or whether it beats another policy) when a
biased simulator, the digital twin, supplies as many extra runs as we like?
And can the guarantee hold *whatever* the twin's bias, without a model of that
bias?

The question is open because the two existing answers disagree. Correlation
arguments say a twin that tracks the real system saves real trials in
proportion to `1/(1−ρ²)`. Worst-case arguments say that for a failure-rate
certificate a twin cannot remove a single real trial, because an adversarial
bias can hide exactly the failures the certificate is about (our own
`twin-certification`). Real robot evaluation sits between these two, and no
method says how far a practitioner can trust the twin when evaluating a policy.

## Why it matters

Real-robot evaluation is the bottleneck of robot learning. Generalist policies
are compared on a few dozen real trials each, often with no confidence
interval (Kress-Gazit et al., 2024). Simulated evaluation scales but is biased
(Li et al., 2024). Certifying autonomous vehicles by real driving alone would
take billions of miles (O'Kelly et al., 2018). A method that turns cheap twin
runs into fewer real trials, *with a guarantee a reviewer or regulator can
check*, changes what evaluation costs. The same machinery serves the
certification and monitoring questions the twin projects here kept asking.

## Related work

**Inference with machine-learned predictions.**
- Angelopoulos, Bates, Fannjiang, Jordan & Zrnic (2023), *Prediction-powered
  inference*, Science; [arXiv:2301.09633](https://arxiv.org/abs/2301.09633).
  Valid confidence intervals from a small labelled set plus many model
  predictions, with no assumption on the model. The predictions are i.i.d.
  covariate-level guesses, not a simulator replaying the same scene, and the
  method does not choose which real points to collect.
- Angelopoulos, Duchi & Zrnic (2023), *PPI++: Efficient prediction-powered
  inference*; [arXiv:2311.01453](https://arxiv.org/abs/2311.01453). Tunes the
  weight on the predictions so the interval is never worse than real-only data.
  This is the classical control-variate coefficient in modern dress, and the
  baseline any twin estimator here has to beat.
- Zrnic & Candès (2024), *Active statistical inference*;
  [arXiv:2403.03208](https://arxiv.org/abs/2403.03208). Uses the model to
  choose which points get labelled. Robot trials are chosen by initial state,
  which is the same lever, but nobody has applied it to sim-to-real evaluation.
- Egami, Hinck, Stewart & Wei (2023), *Using imperfect surrogates for
  downstream inference*; [arXiv:2306.04746](https://arxiv.org/abs/2306.04746).
  Design-based correction when LLM annotations stand in for labels. The same
  structure as a twin standing in for real trials, in another field.

**Multifidelity Monte Carlo and control variates.**
- Peherstorfer, Willcox & Gunzburger (2018), *Survey of multifidelity methods
  in uncertainty propagation, inference, and optimization*, SIAM Review;
  [doi:10.1137/16M1082469](https://doi.org/10.1137/16M1082469). Optimal
  allocation across model fidelities with known costs and correlations. It
  assumes the correlations are known or estimated, and it has no
  finite-sample guarantee under unknown bias. Our `twin-evaluation`,
  `twin-multifidelity` and `twin-control-variate` reproduce its scalar case.

**Anytime-valid inference.**
- Howard, Ramdas, McAuliffe & Sekhon (2021), *Time-uniform, nonparametric,
  nonasymptotic confidence sequences*, Annals of Statistics 49(2);
  [arXiv:1810.08240](https://arxiv.org/abs/1810.08240). Intervals valid at
  every stopping time, so an evaluator can stop as soon as the answer is clear.
- Waudby-Smith & Ramdas, *Estimating means of bounded random variables by
  betting*; [arXiv:2010.09686](https://arxiv.org/abs/2010.09686). Tight
  confidence sequences for bounded outcomes, such as success rates. No version
  uses a simulator as side information yet.

**Simulation for evaluating and validating robots.**
- Li et al. (2024), *Evaluating real-world robot manipulation policies in
  simulation* (SIMPLER); [arXiv:2405.05941](https://arxiv.org/abs/2405.05941).
  Builds simulated counterparts of real manipulation setups and measures how
  well simulated results track real ones across policies. It reports paired
  real and simulated results, but it uses simulation as a *proxy* rather than
  as side information in a valid estimator. Its paired tables are the first
  real data this programme can test on.
- Kress-Gazit et al. (2024), *Robot learning as an empirical science: best
  practices for policy evaluation*;
  [arXiv:2409.09491](https://arxiv.org/abs/2409.09491). Argues for reporting
  trial counts, intervals and failure modes. It sets the reporting bar, but it
  does not reduce how many trials are needed.
- O'Kelly, Sinha, Namkoong, Duchi & Tedrake (2018), *Scalable end-to-end
  autonomous vehicle testing via rare-event simulation*;
  [arXiv:1811.00145](https://arxiv.org/abs/1811.00145). Uses importance
  sampling in simulation to estimate rare failure rates. The estimate concerns
  the simulator; transferring it to the real vehicle is outside its scope.
- Corso, Moss, Koren, Lee & Kochenderfer (2021), *A survey of algorithms for
  black-box safety validation of cyber-physical systems*, JAIR 72;
  [arXiv:2005.02979](https://arxiv.org/abs/2005.02979). Falsification, rare-event
  estimation and the gap between simulated and real validation.

**The reality gap.**
- Tobin et al. (2017), *Domain randomization for transferring deep neural
  networks from simulation to the real world*;
  [arXiv:1703.06907](https://arxiv.org/abs/1703.06907), and Zhao, Peña Queralta
  & Westerlund (2020), *Sim-to-real transfer in deep reinforcement learning for
  robotics: a survey*, IEEE SSCI;
  [arXiv:2009.13303](https://arxiv.org/abs/2009.13303). Both close the gap for
  *training*; neither says how to evaluate under the gap that remains.

**Our own prior steps** (each a small, stylised model; this programme
consolidates them). `twin-evaluation`: the control-variate variance law, and
the finding that a twin replaying the real scene's context gets `ρ = η` while
a noise-free twin gets `ρ = √η`. `twin-pilot`: the break-even correlation
`ρ*(r) = 2√r/(1+r)` and how big a pilot needs to be to decide.
`twin-certification`: without assumptions, a twin cannot shorten a failure-rate
certificate. `twin-shrinkage`, `twin-screen`, `twin-monitor`, `crn-twin`,
`mimic-twinc2st` and `mimic-twinregret` (a twin's detectability by a
two-sample test is a different thing from its cost), plus about 100 `*-twin`
projects, each cataloguing one physical effect a twin can omit.

## Gap

Three things no work above does, stated narrowly enough to check:

1. **One estimator family with finite-sample validity for policy evaluation
   when sim and real are paired by initial state.** PPI and PPI++ assume
   i.i.d. predictions. Multifidelity Monte Carlo assumes known correlations.
   Pairing by replayed context is the robotics-specific structure, and our
   `twin-evaluation` shows it decides most of the gain.
2. **A characterisation of when a twin can and cannot shorten a certificate.**
   The worst-case impossibility (`twin-certification`) and the correlation
   gain are both true; the open part is which checkable assumption on
   twin-real discrepancy, testable from paired data, recovers a provable
   saving, and what that test costs in real trials.
3. **Active and anytime-valid twin-assisted evaluation**: the evaluator picks
   which initial states to run for real and stops when the interval is
   decisive, with the guarantee intact. It is validated on real paired data
   (SIMPLER's tables), not only on models we wrote.

## Hypotheses

- **H1 (validity).** A power-tuned, context-paired control-variate estimator
  keeps nominal coverage at every twin bias in the benchmark. *Refuted if*
  coverage falls more than 2 points below nominal on any benchmark pair at
  `n ≥ 30`.
- **H2 (pairing is the lever).** Context-paired twin runs give at least twice
  the effective-sample gain of unpaired twin runs at equal twin budget.
  *Refuted if* the gain ratio's 95% interval includes 1 on most benchmark
  pairs.
- **H3 (certification).** Under a bounded-discrepancy assumption, checked by a
  pilot of paired runs, a twin-informed failure-rate test needs fewer *total*
  real trials (pilot included) than Clopper–Pearson for ε ≤ 0.05. *Refuted if*
  the pilot needed to check the assumption costs as much as it saves.
- **H4 (active selection).** When twin error varies with initial state,
  choosing real trials by predicted twin error beats uniform selection.
  *Refuted if* there is no gain at equal real budget on heteroscedastic pairs.
- **H5 (anytime).** A betting confidence sequence with the twin as a control
  variate reaches a decision in fewer expected real trials than the same
  sequence without it, with the guarantee intact under optional stopping.
- **H6 (detectability ≠ value).** A twin's two-sample detectability does not
  predict its value as a control variate; its paired correlation does
  (extending `mimic-twinregret` to evaluation).

## Method

**Theory.** Write the estimators as one family (control variate, PPI++,
multifidelity Monte Carlo, stratified sampling) under a paired-context model.
Prove finite-sample validity for bounded outcomes, which needs no assumption
on the twin. Give the efficiency of each estimator as a function of the paired
correlation and the cost ratio. For certification, prove a lower bound on real
trials under each discrepancy class (none, bounded total variation on the
failure event, monotone coupling) and match it with a test.

**Benchmark.** Twin-real pairs in MuJoCo, the open physics engine the
repository already uses. The "real" side is a higher-fidelity model with
effects the twin omits, chosen from those the `*-twin` projects catalogue
(friction, actuator delay, backlash, sensor noise, flexibility), with
parameters taken from datasheets and papers per `research/CLAUDE.md`. These
are labelled clearly as model-versus-model pairs, never as real-robot results.

**Real data.** SIMPLER's published paired real and simulated results are the
first real test. Look for further open datasets that pair sim and real
episodes of the same policies. Running real-hardware trials is an owner step.

## Evaluation

Baselines: real-only intervals (Clopper–Pearson, Wilson, betting confidence
sequences), sim-only (biased), classical control variate, PPI, PPI++,
multifidelity Monte Carlo with estimated correlations, and stratified sampling
by initial state. Metrics: coverage, interval width at a fixed real budget,
real trials to a decision, and the false-certification rate. At least 1,000
replications per cell for coverage, with Monte Carlo error reported. Ablations:
pairing on or off, power tuning on or off, active selection on or off, and the
size of twin bias swept across its plausible range.

## Milestones

1. **Proposal** (this session).
2. **Consolidate.** One `src/` library of the estimators, with tests that
   reproduce the analytic results of `twin-evaluation`, `twin-pilot` and
   `twin-certification`. Write a synthesis table of what the 130 twin projects
   found, and what each says about `ρ`.
3. **Benchmark v1.** Five or more MuJoCo twin-real pairs, test H1, H2 and H6.
4. **Real data.** Extract SIMPLER's paired tables (check every number against
   the paper) and test H1 and H5 on them.
5. **Active and anytime.** Test H4 and H5.
6. **Certification theory.** Test H3: the lower bounds and the matching test.
7. **Paper.** A draft in `paper/` in the venue's format, with every figure
   reproduced by one command.

## Target venue

Conference on Robot Learning (CoRL), main track: an 8-page paper plus
appendix, with code. If the certification theory (milestone 6) carries the
paper, a statistics or machine learning venue (AISTATS) fits better. That
choice is made at milestone 6 and recorded in `LOG.md`. Submitting is an
owner step.

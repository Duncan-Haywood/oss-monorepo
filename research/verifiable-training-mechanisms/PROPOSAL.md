# Proposal: incentive-compatible verification of outsourced ML training

Programme `verifiable-training-mechanisms`, opened 2026-10-24. Written with AI
assistance (Claude Code); results are reported only as the code produces them.
This is a plan, not a result: nothing below has been measured yet unless it
cites an existing project in this repository. Every identifier in "Related
work" was looked up on arXiv or Crossref on 2026-10-24 (title and year
compared with the claim); none is claimed to be endorsed by its authors.

## Question

A requester pays untrusted workers to train a model. Cheating is cheap (train
fewer steps, on less data, in lower precision, or copy another worker) and the
product, a vector of weights, cannot be checked without redoing the work. What
is the cheapest payment-and-audit protocol under which full-effort training is
an equilibrium, when the checks available are (a) a refereed re-execution of
a disputed step, (b) a noisy proper score of the final model on held-out data,
and (c) agreement among redundant workers, and when honest workers themselves
disagree by floating-point drift?

It is open because the three checks come from three literatures that each
assume the others away. Refereed delegation (Verde) assumes a verifier will be
paid to challenge and that drift is negligible or bounded by a tolerance.
Proper scoring and peer prediction assume the reported object is a belief or
label, not a training run. Contract theory prices a hidden action against a
noisy signal, but not against a signal that is an audit with a tolerance.

## Why it matters

Decentralised and outsourced training markets exist (Gensyn's Verde line and
others) and the cheating they must withstand is concrete: a worker saves
compute by skipping steps, and a second worker can submit the same shortcut.
Whoever designs the payment rule today chooses audit rate, stake and tolerance
by judgement. A theorem that says which of those three are redundant, and at
what price full effort is secured, tells a protocol designer how much stake and
how many audits to budget, and tells a requester when buying redundancy (more
workers) is worth less than buying audits. The same cost frontier applies to
any outsourced computation whose output is checked partly by a tolerance test.

## Related work

**Verifying that training happened.**
- Arun et al. (2025), *Verde: Verification via Refereed Delegation for Machine
  Learning Programs*; [arXiv:2502.19405](https://arxiv.org/abs/2502.19405).
  Bisection over the training trace plus reproducible operators, so a referee
  re-executes one step. It settles *how* a dispute is resolved cheaply; it does
  not say what makes anyone raise a dispute, or how much stake the tolerance
  requires.
- Jia et al. (2021), *Proof-of-Learning: Definitions and Practice*;
  [arXiv:2103.05633](https://arxiv.org/abs/2103.05633). The prover logs
  checkpoints and the verifier replays some of them. The definition of "enough
  work" is statistical, which is exactly the tolerance question.
- Zhang et al. (2021), *"Adversarial Examples" for Proof-of-Learning*;
  [arXiv:2108.09454](https://arxiv.org/abs/2108.09454), and Fang et al. (2022),
  *Proof-of-Learning is Currently More Broken Than You Think*;
  [arXiv:2208.03567](https://arxiv.org/abs/2208.03567). Cheaper forged
  traces pass the check. They are the empirical form of our "hidden margin"
  (H1), measured as a break, not priced as an incentive.
- Abbaszadeh et al. (2024), *Zero-Knowledge Proofs of Training for Deep Neural
  Networks*, CCS; [doi:10.1145/3658644.3670316](https://doi.org/10.1145/3658644.3670316).
  A cryptographic route that removes the tolerance question at a large prover
  cost. It marks the other end of the cost frontier we map.
- Ong et al. (2025), *TOPLOC: A Locality Sensitive Hashing Scheme for Trustless
  Verifiable Inference*; [arXiv:2501.16007](https://arxiv.org/abs/2501.16007).
  Tolerant hash-based checking of inference under nondeterminism; the same
  tolerance-versus-forgery trade-off, for inference.
- Canetti, Riva & Rothblum (2011), *Practical delegation of computation using
  multiple servers*, CCS; [doi:10.1145/2046707.2046759](https://doi.org/10.1145/2046707.2046759).
  Refereed delegation with several servers, secure if one is honest. It has
  no payments, and a unanimous wrong answer from colluding servers defeats it.

**Eliciting effort and truth with scores.**
- Gneiting & Raftery (2007), *Strictly proper scoring rules, prediction, and
  estimation*, JASA; [doi:10.1198/016214506000001437](https://doi.org/10.1198/016214506000001437).
  The scoring toolkit. It elicits a belief about a held-out outcome; whether
  the score of a *model* identifies the work behind it is not its question.
- Miller, Resnick & Zeckhauser (2005), *Eliciting informative feedback: the
  peer-prediction method*, Management Science;
  [doi:10.1287/mnsc.1050.0379](https://doi.org/10.1287/mnsc.1050.0379), and
  Prelec (2004), *A Bayesian truth serum for subjective data*, Science;
  [doi:10.1126/science.1102081](https://doi.org/10.1126/science.1102081). Pay for
  agreement with peers, truthful reporting is an equilibrium. Both need a
  common prior and tolerate uninformative equilibria.
- Dasgupta & Ghosh (2013), *Crowdsourced judgement elicitation with endogenous
  proficiency*; [arXiv:1303.0799](https://arxiv.org/abs/1303.0799), and
  Shnayder, Agarwal, Frongillo & Parkes (2016), *Informed truthfulness in
  multi-task peer prediction*; [arXiv:1603.03151](https://arxiv.org/abs/1603.03151),
  and Kong & Schoenebeck (2019), *An information theoretic framework for
  designing information elicitation mechanisms that reward truth-telling*;
  [arXiv:1605.01021](https://arxiv.org/abs/1605.01021). Mechanisms where effort
  is chosen and truthful effort beats uninformative play. The report is a
  label; a training run has no label per task.
- Gao, Wright & Leyton-Brown (2016), *Incentivizing evaluation via limited
  access to ground truth: peer-prediction makes things worse*;
  [arXiv:1606.07042](https://arxiv.org/abs/1606.07042). The closest prior
  art: mixing a few ground-truth checks with peer prediction can hurt. It is
  the result our H3 tries to transfer to training, and may not.

**Hidden action, costly verification and contracts.**
- Townsend (1979), *Optimal contracts and competitive markets with costly
  state verification*, J. Economic Theory;
  [doi:10.1016/0022-0531(79)90031-0](https://doi.org/10.1016/0022-0531(79)90031-0).
  Verify only on a bad signal and pay a penalty on conviction. The skeleton
  of an audit-plus-stake design; verification there is exact, ours has a
  tolerance.
- Cai, Daskalakis & Papadimitriou (2015), *Optimum statistical estimation with
  strategic data sources*, COLT; [arXiv:1408.2539](https://arxiv.org/abs/1408.2539).
  Payments that buy effort in estimation. The effort is data quality for a
  statistic, not compute for a trajectory.
- Dütting, Roughgarden & Talgam-Cohen (2019), *Simple versus optimal
  contracts*, EC; [arXiv:1808.03713](https://arxiv.org/abs/1808.03713). Linear
  contracts are near optimal under hidden action; our cost frontier should be
  compared with the best linear contract on the final-model score.

**Our own earlier steps** (small stylised models; this programme consolidates
and tests them). `verification-game`: inspection-game equilibrium `x* = k/(λS+h)`,
verifier free-riding saturates. `audit-allocation`: deterrence probability
`g/(g+S)` per job. `reproducible-refereed-training`: measured float32 drift
under reordering, and the tolerance it forces. `verifier-bribery`: bribe floor
and collusion-proof stake. `multi-verifier-audit`, `verifier-cascades`,
`peer-prediction-effort` (output agreement pays the always-majority strategy
more than honesty; the shirking equilibrium survives), `effort-elicitation`
(information rent of proper scores), `property-elicitation-verification`,
`decentralized-verification-markets`.

## Gap

Stated narrowly, so it can be checked against the list above:

1. **The tolerance is a cheating margin with a price.** No cited work links the
   *drift tolerance τ* of a refereed or replay check to the *incentive* cost:
   a worker can shave effort up to what τ hides. We aim to derive the hidden
   degradation as a function of τ, step count and optimiser, and the extra
   stake that closes it.
2. **A joint contract over audit, stake and a held-out score, with a proved
   cost frontier.** Existing work analyses each check alone (Verde, scoring,
   peer prediction) or one pair with exact audits (Townsend, Gao et al.). We
   prove which of audit rate, stake and score term are redundant, and compare
   the optimum with the best linear contract.
3. **Colluding workers defeat agreement-based checks, and replication does not
   help against a deterministic shortcut.** We aim at the stake needed against
   `m` workers who submit the same cheap trajectory, which replication alone
   cannot catch, and show what a single audit buys.
4. **Measured on real training.** The drift and the hidden degradation are
   measured on real small-model training runs, not assumed.

## Hypotheses

- **H1 (the margin is real and priced).** There is a skip-or-shortcut strategy
  that passes a tolerance-τ check at every τ above the benign drift measured on
  real training, and its loss degradation grows with τ. *Refuted if* for
  all τ at or above measured drift, every passing deviation degrades the final
  held-out loss by less than the seed-to-seed standard deviation.
- **H2 (joint contract beats its parts).** At some parameter region the joint
  contract (audit probability, stake, score bonus) costs the requester strictly
  less than the better of audit-only and score-only contracts. *Refuted if* the
  optimal cost equals the lower envelope of the two everywhere.
- **H3 (peer prediction does not help once audits exist).** With a positive
  audit rate, adding an agreement term between redundant workers raises the
  minimum cost of implementing full effort. This transfers the finding of
  Gao et al. *Refuted if* an agreement term lowers it in some region once
  uninformative and copying equilibria are excluded.
- **H4 (collusion).** A coalition submitting one shared cheap trajectory
  escapes replication with probability one, and the stake needed to deter it
  is a closed form that falls as `1/m` as in `verifier-bribery`, once one
  independent audit per job is added. *Refuted if* brute-force equilibrium
  search on small instances finds a coalition deviation the formula forbids.
- **H5 (lower bound).** Any mechanism that is incentive compatible with
  detection resolution τ and a penalty cap `S` has expected verification cost at
  least a function `L(g, τ, S)` that the joint contract meets within a constant
  factor. *Refuted if* a mechanism in the model beats `L`.
- **H6 (predicts reality).** The model's predicted hidden degradation matches
  the measured one on real training within a factor of two. *Refuted if* the
  ratio leaves `[0.5, 2]` on a majority of settings.

## Method

**Theory.** One model: a worker picks an effort profile over `T` steps (a
fraction `e` of honest steps, optionally copying); a check detects a deviation
only above resolution τ; a held-out score has noise variance fixed by
test-set size. Derive the equilibrium cost of each check alone, then of the
joint contract, as a linear programme in the contract's payments (the standard
route for hidden-action problems), and prove H2 to H5 or exhibit the
counterexamples. Reuse the closed forms of the earlier projects as test cases.

**Experiments.** (a) Drift: reuse the emulated-float32 operators of
`reproducible-refereed-training` and, where an installable framework allows,
measure real nondeterminism of small-transformer and logistic-regression
training on a public dataset (probe the data host first; fall back to a
dataset that ships with an installed library). (b) Hidden margin: implement
shortcut strategies (skip steps, subsample data, lower precision) and test
whether a tolerance-τ referee passes them; measure the loss cost. (c)
Equilibria: exact best-response and brute-force search on small games for H4.

## Evaluation

Baselines: audit-only (Verde-style, stake and rate from `verification-game`),
score-only (proper score on held-out data, with and without a linear contract),
replication with majority agreement, peer prediction (output agreement and
Dasgupta–Ghosh), and Townsend-style audit on bad signal. Metrics: requester
cost per unit of secured effort, minimum stake, deterrence probability,
hidden degradation (held-out loss) and false-dispute rate on honest drift.
At least 20 seeds per training setting with 95% bootstrap intervals; the test
for each comparison is named in the log. Ablations: tolerance, number of
workers, test-set size, audit rate, optimiser, precision. Equilibrium claims
are checked by brute force on small instances, never only by the formula.

## Milestones

1. **Proposal** (this session).
2. **Unify the model.** One `src/` library with the effort, detection and score
   model, and tests reproducing the closed forms of `verification-game`,
   `audit-allocation`, `verifier-bribery` and `effort-elicitation`.
3. **Measure drift and the margin.** Real-training drift and shortcut
   experiments; test H1 and H6.
4. **Single-check frontiers.** Audit-only, score-only and replication costs;
   compare with the best linear contract.
5. **Joint contract.** Prove and test H2, H3 and H5.
6. **Collusion.** H4, with brute-force equilibrium search.
7. **Paper.** A draft in `paper/` in the venue's format, one command per figure.

## Target venue

ACM Conference on Economics and Computation (EC), main track, as a theory
paper with an experimental section; check the current call for the page
limit and artefact rules before drafting. AAMAS is the fallback if the
real-training experiments carry the paper. Submitting is an owner step.

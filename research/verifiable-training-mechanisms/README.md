# Verifiable training mechanisms: what is the cheapest payment-and-audit protocol that makes honest ML training an equilibrium?

**Status: open research programme, milestones 2 to 5 done.** Results on H1, H2, H3 and H5 (below); H4 and H6 untested. This directory is where
the work toward one publishable paper accumulates across sessions; it consolidates about 60
small scoring, audit and verifier projects in this repository into one question (see
[`PROPOSAL.md`](PROPOSAL.md)).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/verifiable-training-mechanisms/

**The question.** A requester pays untrusted workers to train a model. Cheating is cheap (skip
steps, use less data, lower precision, copy a peer) and the weights cannot be checked without redoing
the work. The programme asks for the cheapest protocol that makes full effort an equilibrium when the
available checks are a refereed re-execution of one step, a noisy proper score on held-out data and
agreement between redundant workers, and when honest workers themselves differ by floating-point drift.

**Why it is open.** Refereed delegation, scoring rules, peer prediction and contract theory each
assume the others away. The programme prices the drift tolerance as a cheating margin, proves a cost
frontier for the joint contract, bounds collusion on a shared shortcut, and measures all of it on real
small-model training.

- [`PROPOSAL.md`](PROPOSAL.md): question, related work (17 checked references), gap, hypotheses
  H1 to H6, method, evaluation, milestones, target venue.
- [`src/vtm/`](src/vtm): the unified library (stdlib only): a 2x2 equilibrium solver, the inspection
  game from payoff matrices, audit thresholds, bribery floors and the Brier effort-rent law.
  `PYTHONPATH=src python3 -m pytest tests` runs 33 tests (numpy and scipy needed for 11) (14 reproduce the closed
  forms of `verification-game`, `audit-allocation`, `verifier-bribery` and `effort-elicitation` and
  agree with those projects' own code, 5 test the numpy harness `src/vtm/margin.py`).
- [`experiments/margin/`](experiments/margin): **milestone 3, the hidden margin on real training (H1).** A 64-64-10 MLP
  on the real scikit-learn digits data, 20 seeds. A referee that re-executes one step and accepts within L2 distance tau
  passes a worker that skips, subsamples or lowers precision whenever that is cheap. Benign float16 drift is at most 9e-3
  (median 3e-5); the skip cheat passes 30% of steps at tau = 1e-2 and loses less than one seed std of held-out loss, and loses
  30 stds only at tau = 0.1, about 10x the worst benign drift. So the margin at drift-sized tolerances is saved work, not a worse model.
  ![held-out loss given up versus tau](experiments/margin/margin.png)
- [`experiments/frontier/`](experiments/frontier): **milestone 4, single-check frontiers and a first look at H2.** The measured skip family becomes the
  worker's action set and `src/vtm/contract.py` solves the cheapest contract as a linear programme (checked against the closed form and a brute-force grid).
  With a tolerance above benign drift, audit-only cannot implement full effort at any stake (a free cheaper action exists); score-only costs 5.8x the compute
  at 540 test examples; the joint contract beats both in 4 of 45 cells (ratio 0.72 to 0.81, only with 5,000 test examples). If the requester instead
  buys the quality the tolerance sanctions, one audited step deters and the cost is the effort plus 1/1500.
  ![requester cost versus tolerance](experiments/frontier/frontier.svg)
- [`experiments/joint/`](experiments/joint): **milestone 5, peer agreement (H3) and a lower bound (H5).** `src/vtm/peer.py` solves the two-worker contract by linear programme. An agreement term between redundant workers lowers the cost when cheats cannot coordinate, but across 1,349 random instances where cheats share one trajectory and copying is excluded it never beats the audit. A one-sided resolution bound `max(C, g/p - S)` is proved and holds in 2,755 random instances (exact in 2,410), but H5's "within a constant factor" fails (worst ratio 2,093) and the bound is vacuous for a Gaussian score.
- [`LOG.md`](LOG.md): the research log. Hypotheses are written down before experiments are run.
- How runs work on a programme: [`../PROGRAMMES.md`](../PROGRAMMES.md).

Produced with AI assistance (Claude Code). It builds on published work it cites and implies no
affiliation with or endorsement by any author or lab.

## Owner steps

- Submitting the paper (publishes under a name).

## Outside dependencies

None yet. Planned: a public dataset and an open-source ML framework for the real-training
experiments, probed for reachability first.

---
title: "Start here: can you trust a model someone else trained for you?"
seo_title: "Can you trust a model someone else trained? Verifiable training"
date: 2026-10-30
tags: [start-here, verifiable-training-mechanisms, mechanism-design, ml-security]
description: "For mechanism designers, ML-security researchers and anyone outsourcing training: what the open verifiable-training programme found, and how to rerun it."
---

# Start here: can you trust a model someone else trained for you?

This guide is for three kinds of reader. You might work in mechanism design or contract theory and want a concrete setting where audits, scores and stakes interact with real numbers. You might work on ML security and care about workers who skip steps, plant weights or collude. Or you might pay someone else, a cloud provider, a decentralised network or a contractor, to train a model, and wonder what stops them from doing less work than you paid for.

The work lives in one open research programme, [`research/verifiable-training-mechanisms`](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/verifiable-training-mechanisms/). Its question: what is the cheapest payment-and-audit protocol that makes honest ML training an equilibrium?

## The problem, in your words

"I paid for 10,000 training steps. How would I know if they ran 7,000?" "We can re-run one step to check it, but two honest GPUs never agree to the last bit, so we need a tolerance. How big?" "If three workers all submit the same answer, does that prove anything, or did they copy each other?"

Cheating at training is cheap: skip steps, use a quarter of the batch, reuse an old gradient, lower the precision, copy a peer. The weights cannot be checked without redoing the work. The checks you can afford are a re-run of one disputed step, a noisy score on held-out data and agreement between redundant workers. Each has a gap, and honest workers differ by floating-point drift, so a referee must accept some difference. That tolerance is room to cheat.

## What you get

- **One library** in `src/vtm/`: a 2x2 equilibrium solver, the inspection game from payoff matrices, audit thresholds, bribery floors and an effort-rent law for the Brier score. The core is standard-library Python. Its tests reproduce the closed forms of four earlier projects in the repository (`verification-game`, `audit-allocation`, `verifier-bribery`, `effort-elicitation`) and check them against those projects' own code.
- **Measurements on real training.** Small models on real data: an MLP on the scikit-learn digits data, and a 2-layer character-level transformer on 87 kB of real text. They are small, and the README says so.
- **Contracts solved exactly.** The measured cheats become the worker's action set, and the cheapest contract is solved as a linear programme, checked against closed forms and brute force.
- **A log that keeps its corrections.** `LOG.md` holds 50-odd milestones, each with predictions written before the run. An agent note in `docs/reports/vtm-milestone-48.md` records a sign error in milestone 47, the fix, and a claim withdrawn because of it.
- **A paper draft** in `paper/`, in the ACM EC format. The target is the ACM Conference on Economics and Computation, with AAMAS as the fallback. Its README says two TODOs remain and it is not for submission yet.

## What it has found so far

- **The tolerance is a real margin, and it depends on the cheat.** On the digits MLP, a referee accepting within distance 1e-2 passed a skip-steps cheat on 30% of steps while held-out loss stayed within one seed's spread. On the transformer, skipping and quarter-batch gradients cost little at small tolerances, but a reused ("stale") gradient cost 2.1 seed standard deviations at 1e-2. So the "cheating is harmless" reading holds for some cheats and not others.
- **Audit alone fails with a tolerance.** Once the tolerance exceeds benign drift, an audit-only contract cannot make full effort an equilibrium at any stake, because a cheaper action passes for free. A score-only contract cost 5.8 times the compute at 540 test examples. The joint contract beat both in only 4 of 45 cells.
- **Peer agreement rarely pays once audits exist.** Using measured agreement rates for cheap gradients, agreement saved 12 to 14% over audit-only in one group of cells and nothing elsewhere.
- **Replication is not a cheap deterrent.** Against a coordinating majority, the stake that deters a coalition, max(0, g/p − 1), matched brute force in all 140 cells and did not fall as workers were added. The proposal's own 1/m law was refuted for a per-job audit. Replication earned its place only as a reliability tool against faulty workers, bought as three replicas, when the audit is expensive and a bad result costs a lot.
- **A bribable auditor needs a bond.** A reward for catches cannot keep the auditor honest; a bond forfeited on meta-audit can, and the bond grows roughly linearly with the number of workers.
- **Magnitude checks miss a patient cheater.** Recent milestones studied silent bit flips and checks on submitted updates. A check on each step's size stopped one-shot weight plants. But a cheater who stayed inside it for 200 steps harmed every job, and tightening the check raised false alarms on honest steps from 0.17% to 3.3% without lowering the harmful share. Milestone 52 traced the gap to progress: a near-zero step passes every size check. The log's next step is a check on progress, such as loss on a batch the verifier holds.

All of this is one tiny model or swept parameters at a time. Treat the numbers as where conclusions flip in this setting, not as figures for your deployment.

## Your first ten minutes

1. **Open the live page**: [research/verifiable-training-mechanisms](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/verifiable-training-mechanisms/).
2. **Fetch the programme and the four projects its tests check against.** A sparse clone avoids the full history:

   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo.git
   cd oss-monorepo
   git sparse-checkout set research/verifiable-training-mechanisms research/verification-game \
     research/audit-allocation research/verifier-bribery research/effort-elicitation
   cd research/verifiable-training-mechanisms
   ```

   Without the four sibling projects the cross-checks against their code are skipped, not failed.
3. **Run the closed-form tests.** Standard library only:

   ```bash
   PYTHONPATH=src python3 -m unittest tests.test_reproduce -v
   ```

   When this guide was written, 14 tests passed in well under a second.
4. **Rerun the collusion result.** Also standard library, about 3 seconds:

   ```bash
   cd experiments/collusion
   python3 run.py
   git diff --stat .
   ```

   Here `results.txt` came back byte for byte. `results.json` changed only in the last digits of the closed-form column (for example 8.999999999999991 where the committed file has 9.0). That is floating-point noise, not a different result, but it is the kind of thing worth reporting.
5. **Read `results.txt`.** The table of stakes by number of workers is flat down each column. That flat line is the refuted 1/m law.
6. **Read the newest entry in `LOG.md`.** It shows how a milestone is planned, predicted and then scored.

The full suite (`PYTHONPATH=src python3 -m pytest tests`) needs numpy and scipy for 11 of its 33 tests, and the transformer experiments need torch.

## How to get involved

Mechanism designers can do the most with the theory. The H5 proof is still a TODO in the paper. A known result that already covers one of the hypotheses, or a cheaper contract the linear programme missed, would change the paper.

ML-security readers can help with attacks. The log's open question is a progress check, and the adversary that defeats it. A cheat the action set does not include, with a sketch of its cost, is a useful issue.

If you outsource training, a field report helps: which checks your provider offers, what tolerance they use, and what a re-run of one step costs you. A published rate of silent data corruption converted to a per-job figure would also help; the log notes that conversion has not been done.

Send ideas through the [feature request form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml) and errors through a [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml). The maintainer reviews fork pull requests by hand, and the repository's agents never act on them. There is no promise that an idea is built.

## Cost and data

Free and MIT licensed. The experiments use public datasets and open-source libraries. Nothing here collects data about you.

## What it does not do

- **It is not a product or a security audit.** There is no service that verifies your training run. The results are research on tiny models, and they are not security, legal or procurement advice.
- **Many inputs are swept, not measured.** Audit costs, capital charges and fault rates are parameters. The grids show where a conclusion flips, not where a real deployment sits.
- **It is not peer reviewed or submitted.** Submitting is a step only the owner takes.
- **No affiliation.** It cites published work and implies no endorsement by its authors. It was made with AI assistance, with the owner steering.

## Where to go next

- The question, 17 checked references and hypotheses H1 to H6: `research/verifiable-training-mechanisms/PROPOSAL.md`
- Every milestone with predictions and outcomes: `research/verifiable-training-mechanisms/LOG.md`
- The latest agent hand-off note: `docs/reports/vtm-milestone-48.md`
- The tolerance result as a short post: [What a verification tolerance costs](2026-10-24-what-a-verification-tolerance-costs.md)
- The auditor result: [Paying an auditor for catches cannot keep it honest](2026-10-27-verifiable-training-bribable-auditor.md)
- Reproducing and citing any research here: [Start here: the open research](2026-10-29-start-here-research.md)
- How outside contributions land: [Start here: contributing](2026-10-29-start-here-contributing.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).

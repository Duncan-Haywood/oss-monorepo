---
title: "Start here: training across slow links, and a DiLoCo baseline you can rerun"
seo_title: "Training across slow links: a reproducible DiLoCo baseline"
date: 2026-10-30
tags: [start-here, lowcomm-training, distributed-training, machine-learning]
description: "For ML engineers syncing workers over slow links and students who need a baseline: what the open lowcomm-training programme measured, and how to rerun it."
---

# Start here: training across slow links, and a DiLoCo baseline you can rerun

This guide is for two kinds of reader. You might be an ML engineer whose workers sit behind slow or expensive links, in different data centres, on spare GPUs or across a volunteer network, and you are weighing DiLoCo-style local SGD: each worker takes H steps alone, then they average. Or you might be a student who needs a small, honest baseline for local SGD, compression or robust aggregation, with seeds, logs and numbers you can reproduce on a laptop before scaling up.

The work lives in the open research programme [`research/lowcomm-training`](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/lowcomm-training/), which builds on about a dozen smaller projects in the repository that each model one axis on a quadratic. The question: of the sync interval, compression, delay, outer momentum and robust aggregation, what sets the final loss, and can a small rule predict a configuration nobody has run?

## The problem, in your words

"If we sync every 64 steps instead of every step, how much loss do we give up?" "Should we compress the deltas, and does error feedback really make top-k free?" "One worker might be broken or hostile. Will a median save us?" "The papers disagree, and every one used a different learning rate."

That last complaint turned out to matter most here. Several early results in this programme reversed once the learning rate was tuned for each setting, and the log keeps both versions.

## What you get

- **A simulated DiLoCo harness** in `src/lowcomm/`: M workers training a small GPT on Tiny Shakespeare, H inner steps, then an outer step, with pluggable compressors and aggregators. Milestone 1 checks that it reproduces plain synchronous training exactly at M = 1, H = 1, and matches the `noisy-local-sgd` closed form on a quadratic (ratio 0.983). It needs torch.
- **A numpy twin of the harness** in `experiments/numpy_h_sweep/` for runs without torch.
- **The closed forms it starts from.** Small projects with their own tests: `noisy-local-sgd`, `local-sgd-bias`, `outer-momentum`, `compressed-outer`, `delayed-outer`, `robust-outer`, `compressed-sync`, `error-feedback-sync` and `sparse-outer-sync`.
- **A log with predictions written first.** `LOG.md` states each hypothesis and its prior before the run, then the outcome, including the many that failed.
- **A draft paper section** on robust aggregation, `paper/section_breakdown.md`, whose table `paper/breakdown_table.py` rebuilds from the recorded runs.

## What it has measured so far

All on small models: a 413k-parameter GPT, and in the newest milestones a 914,880-parameter one, with one corpus and a few seeds per cell.

- **Tune the learning rate before you believe a sync-interval result.** An early numpy sweep looked U-shaped and had DiLoCo beating synchronous training. Tuning the inner learning rate for each H erased both readings. On the GPT, a short budget showed a gap of +0.155 nats at H = 240. A four-times longer budget shrank the gaps about four-fold. With every method re-tuned, H = 16 beat synchronous AdamW by 0.012 nats over 11 paired seeds (95% interval −0.021 to −0.004). That is a small edge at one setting, not a general claim.
- **Random sparsification costs loss in a straight line.** Keeping 1/2 to 1/16 of each delta at random, the excess loss grew linearly in 1 + ω, where ω is the compressor's variance factor (R² 0.999).
- **Error feedback makes top-k nearly free, up to a point.** Top-k with error feedback at keep 1/16 matched uncompressed loss within noise on all three seeds. At 1/64 it cost +0.043 nats and at 1/256 +0.121, refuting the prediction that 1/64 would stay within 0.02.
- **The median breaks at half the workers.** With 16 workers, one attacker was at the noise floor. Coordinated attackers cost 2.5 to 5 times more than independent ones at the same count. Both kinds of attack diverged at 8 of 16, the classical breakdown point of the median, reached on a real transformer.
- **A three-constant rule predicts held-out cells.** The rule loss = L0 + a·ω·(H/16)^b, fitted on a third of the grid, had a held-out error of 0.91% against 1.72% for a five-constant additive power law, and was better in 288 of 300 random splits. The log flags the limits: the rule's form was chosen after seeing these cells, and it fails when every fitted cell has the same H. At the wider model the compression cost about halved, and a refit missed held-out cells by 2.54%, refuting the prediction of under 1%.

## Your first ten minutes

1. **Open the live page**: [research/lowcomm-training](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/lowcomm-training/).
2. **Fetch the programme and its closed-form starting point** with a sparse clone:

   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo.git
   cd oss-monorepo
   git sparse-checkout set research/lowcomm-training research/noisy-local-sgd
   ```

3. **Start with the theory baseline.** Pure Python, no dependencies:

   ```bash
   cd research/noisy-local-sgd
   PYTHONPATH=src python3 -m unittest discover -s tests -v
   PYTHONPATH=src python3 experiments/run.py
   git diff --stat experiments/
   ```

   When this guide was written, 9 tests passed in under a second, the experiment ran in about 2 seconds and `git diff` was empty. Its first table compares the exact stationary loss with a literal simulation; the ratios were 0.998 to 1.002.
4. **Test the numpy harness.** It needs only `numpy`:

   ```bash
   cd ../lowcomm-training/experiments/numpy_h_sweep
   PYTHONPATH=. python3 -m unittest discover -s tests -v
   ```

   Here 7 tests passed in about 18 seconds.
5. **Rebuild the breakdown table**, standard library only, from the recorded runs:

   ```bash
   cd ../..
   python3 paper/breakdown_table.py
   ```

   Compare it with the table in `paper/section_breakdown.md`.
6. **If you have torch and an hour or more,** the README gives one command per milestone with its run time. The harness tests are `PYTHONPATH=src python3 -m pytest tests -q` (the README says 6 tests, about 40 seconds), and `experiments/m1_check.py` takes about 4 minutes. Most GPT sweeps take 25 minutes to 2 hours on 4 CPU cores. This guide did not rerun those.

## How to get involved

Engineers who run local SGD at real scale can add what this programme cannot: a field report. Your H, worker count, compressor and the loss gap you saw against synchronous training, even roughly, show whether the small-model shapes survive. A run on a word-level corpus or a larger model would test the composition rule where the proposal says the main-track paper needs it to hold: a word-level corpus at more than one size.

Students can extend a cell the log names as next. Milestone 6m says the cells that would tell the candidate forms apart are H = 8 and a second keep level at H = 64, with six seeds each. A reproduction that disagrees with a committed results file is also useful.

Send ideas through the [feature request form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml) and wrong numbers through a [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml). The maintainer reviews pull requests from forks by hand; the repository's agents never act on them. Nobody promises that an idea gets built.

## Cost and data

Free and MIT licensed. The corpus is Tiny Shakespeare, and the logged runs were on CPU cores, not GPUs. Nothing collects data about you.

## What it does not do

- **It is a simulation on one machine.** Workers are simulated, so bytes on the wire, latency and stragglers are not measured. The README notes that bytes against loss is not modelled.
- **The models are tiny.** Two sizes under a million parameters, one character-level corpus, two to eleven seeds per cell. It says nothing yet about billion-parameter runs.
- **It is not a training framework.** Use it to reason and to check your intuitions, not to run production training. It is not advice on infrastructure spending.
- **Not peer reviewed or submitted.** The first target is a workshop at NeurIPS or ICML; submitting is a step only the owner takes. No lab affiliation is implied, and the work was made with AI assistance, with the owner steering.

## Where to go next

- The question, 16 related works and hypotheses H1 to H6: `research/lowcomm-training/PROPOSAL.md`
- Every milestone, newest first: `research/lowcomm-training/LOG.md`
- The closed forms behind each axis: `research/noisy-local-sgd`, `research/compressed-outer`, `research/delayed-outer`, `research/robust-outer`
- The learning-rate lesson as a short post: [Tuning the inner learning rate erased our DiLoCo win](2026-10-25-tuning-the-inner-learning-rate-erased-the-diloco-win.md)
- The median result: [The median wall at 8 of 16](2026-10-28-the-median-wall-at-eight-of-sixteen.md)
- Reproducing and citing any research here: [Start here: the open research](2026-10-29-start-here-research.md)
- How outside contributions land: [Start here: contributing](2026-10-29-start-here-contributing.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).

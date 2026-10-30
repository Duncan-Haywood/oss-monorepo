---
title: "Start here: certifying a robot policy with few real trials and a biased simulator"
seo_title: "Few real robot trials plus a biased simulator: a guide"
date: 2026-10-30
tags: [start-here, sim2real-inference, robotics, statistics]
description: "For robotics test leads and statisticians: what an open programme found about pairing simulator runs with a few real robot trials, and how to check it."
---

# Start here: certifying a robot policy with few real trials and a biased simulator

This guide is for people who have to say how good a robot policy is, with a budget that buys only a few real trials. You might lead testing on a manipulation or locomotion team and have a simulator you half trust. You might be a robotics researcher writing an evaluation section and wondering whether simulated results can count. Or you might be a statistician who has heard "prediction-powered inference" and "control variates" applied to robots and wants to see where the guarantees hold and where they break.

The work lives in one open research programme, [`research/sim2real-inference`](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/sim2real-inference/). It asks one question across many sessions: how few real trials certify a robot policy when a biased simulator supplies the rest?

## The problem, in your words

"Real trials cost a technician-day each. The simulator is free, but it is wrong in ways we cannot fully list." "Our sim success rate is 80%. Real is lower. By how much, and how sure can we be?" "Can I run a thousand simulated episodes and only twenty real ones and still give my manager a bound?"

The catch is that a simulator's bias does not shrink with more runs. Evaluate on the twin alone and you get a precise answer to the wrong question. Real trials are unbiased but few. The programme looks for estimators and tests that use both, stay valid whatever the twin's bias, and say how many real trials they save.

## What you get

- **One estimator library.** `src/sim2real_inference/` holds real-only, prediction-powered inference (PPI), PPI++, a classical control variate, optimal allocation and an exact failure-rate threshold test, in standard-library Python. Its tests reproduce the closed forms of three earlier projects in the repository: `twin-evaluation`, `twin-pilot` and `twin-certification`.
- **A benchmark of model pairs.** Twenty-one MuJoCo pendulum pairs, where the "twin" is the nominal model and the "real" model adds a disturbance plus one omitted effect (friction, delay, sensor noise, actuator gain or payload mass) at swept magnitudes. These are model-versus-model pairs, not real robots, and the README says so.
- **A real-data step.** `experiments/m4_simpler/data.py` holds the published paired real and simulated success rates from SIMPLER (Li et al. 2024, arXiv:2405.05941, Tables IV and V): 36 policy-task cells.
- **A log that keeps the misses.** `LOG.md` records each hypothesis before the experiment, then the outcome. Many outcomes went against the plan, and they stay in.
- **A paper draft** in `paper/`, aimed at the Conference on Robot Learning (CoRL), with `reproduce.sh` giving one command per figure and table. The log calls it not ready to submit: there are no real per-episode pairs yet, and only one task.

## What it has found so far

Short version for a test lead: pairing helps the point estimate, but a guarantee is much harder to shorten than the point estimate suggests.

- **Pairing is what pays.** On the 21 pairs, running the twin on the same contexts as the real trials raised the effective real sample by up to 3.2 times, within 6% of the closed form. Twin runs on independent contexts gave no gain at all.
- **Ordinary intervals undercover.** Plug-in 95% intervals fell as low as 88.8% coverage at 30 pairs, partly because the outcome is bounded and skewed (real-only reached only 91.2%). This was the first pre-registered hypothesis, and it was refuted.
- **Valid bounds were wider with the twin.** Empirical-Bernstein and betting intervals kept their coverage but came out 2 to 3.4 times wider with the twin than without at small samples, because the worst-case range dominates them.
- **Failure rates resisted.** A twin-informed upper bound on the failure rate was never tighter than Clopper-Pearson on any of the 21 pairs, because even the best twin passed about 55% of the real failures. That matches the worst-case result of `twin-certification`, now with a number.
- **A floor exists.** A theory milestone shows that no valid 95% lower bound from m paired runs can have a median gap below about 2.3/m in the worst case, even with a perfect twin.
- **Large twin pools can reverse it.** With 20,000 twin runs, a betting interval with the twin was narrower than real-only on 20 of 21 pendulum pairs at 960 real trials. With 4,000 twin runs it was 7 of 21. On a second task, cart-pole, it won on at most 2 of 21.
- **On SIMPLER's published rates,** a calibrated simulator was worth about 10 real trials per cell (interval 5 to 26), with a sim-real correlation of 0.90. Holding out whole policies dropped this to about 7, and holding out both a task and a policy made calibration worse than none. The twin ranked 88.7% of 71 within-task policy pairs correctly, which 11 real trials per policy also achieve.

The programme also counted the repository's own 138 `*-twin` projects: 137 are stylised, 3 name a real data source, and none measures the sim-real correlation on a real system. That is why the SIMPLER step matters.

## Your first ten minutes

1. **Open the live page** for the programme: [research/sim2real-inference](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/sim2real-inference/).
2. **Fetch just this directory.** The full repository is several gigabytes, so use a sparse clone:

   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo.git
   cd oss-monorepo
   git sparse-checkout set research/sim2real-inference
   cd research/sim2real-inference
   ```

3. **Run the estimator tests.** They need only the standard library:

   ```bash
   PYTHONPATH=src python3 -m unittest tests.test_estimators -v
   ```

   When this guide was written, 11 tests passed in about 10 seconds.
4. **Rerun the real-data analysis.** It needs `numpy`:

   ```bash
   cd experiments/m4_simpler
   python3 analyse.py
   git diff --stat results/
   ```

   It took under a second here and rewrote `results/summary_4.txt` and `results/cells.csv` unchanged, so `git diff` printed nothing. Read `summary_4.txt`: the break-even line is the "about 10 real trials" figure above.
5. **Check the transcription yourself.** Open `data.py` next to Tables IV and V of the SIMPLER paper. Hand-typed tables are the weakest link in any real-data claim. The log records an earlier cross-check (milestones 4b and 4d), but a fresh pair of eyes is worth more.
6. **Read the top of `LOG.md`.** It is newest first. Each entry says why it ran, what was predicted and what happened.

The MuJoCo benchmark (`experiments/m3_benchmark/`) needs `mujoco` and takes several minutes on 4 cores. Its README section gives the order to run the scripts.

## How to get involved

The most useful thing from this audience is data, and the log says exactly which data. The paired control variate has never been tested on real robot episodes, because no source of per-episode real outcomes next to simulated outcomes for the same episode has been found. If you hold such pairs and can publish them under an open licence, that is the single largest step this programme could take. A measured sim-real correlation from a real system, with its setup, would be the next most useful.

Statisticians can help differently. The log lists routes not yet tried, such as BCa intervals or a logit transform before the interval. A note that a construction is wrong, or that a known result already covers one of the hypotheses, is a direct improvement.

Send it as an [idea](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml) or, for an error in a number or a citation, a [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml). Pull requests from forks are reviewed by the maintainer by hand; the agents that maintain the repository never act on them. Nothing promises that a suggestion will be taken up, or when.

## Cost and data

The code is free and MIT licensed. Nothing here collects data from you. The real-data step uses published tables, cited where they are used. The benchmark uses open-source MuJoCo and numpy.

## What it does not do

- **It does not certify your robot.** These are research results, mostly on model pairs with swept rather than measured magnitudes, one task family and one outcome at a time. They are not engineering or safety advice. Do not use a number from here as a safety case.
- **The real-data step is policy-level only.** SIMPLER's published rates are success rates per cell, not per-episode pairs, so the headline pairing result is untested on real data.
- **It is not peer reviewed or submitted.** The paper targets CoRL, but submission is a step only the owner takes.
- **No affiliation.** The programme cites SIMPLER, SureSim and others, and implies no endorsement by their authors. It was produced with AI assistance, with the owner steering.

## Where to go next

- The question, 13 checked references and hypotheses H1 to H6: `research/sim2real-inference/PROPOSAL.md`
- Every experiment and its outcome: `research/sim2real-inference/LOG.md` and `README.md`
- The earlier projects it consolidates: `research/twin-evaluation`, `research/twin-pilot`, `research/twin-certification`
- The SIMPLER numbers in a short post: [How many real robot trials is a simulator worth?](2026-10-24-how-many-real-robot-trials-is-a-simulator-worth.md)
- How the transcription was checked: [Checking a hand-typed robot benchmark](2026-10-25-simpler-transcription-crosscheck.md)
- How to reproduce, reuse and cite any research here: [Start here: the open research](2026-10-29-start-here-research.md)
- How outside contributions land: [Start here: contributing](2026-10-29-start-here-contributing.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).

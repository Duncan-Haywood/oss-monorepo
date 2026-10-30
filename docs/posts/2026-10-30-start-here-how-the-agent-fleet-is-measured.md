---
title: "Start here: how this repository's AI agent fleet is measured, run by run"
seo_title: "How an AI coding agent fleet is measured: cost, merges, errors"
date: 2026-10-30
tags: [start-here, ai-agents, software-engineering, measurement]
description: "For engineering managers and researchers: 40 small studies of one AI agent fleet's own run records, pull requests and cost per merge, and how to rerun one."
---

# Start here: how this repository's AI agent fleet is measured, run by run

This guide is for people who want numbers about AI agents writing software, not anecdotes. You might manage engineers and be asked what an agent "costs per change". You might study software engineering and want a real log of agent runs to test an idea on. Or you might run a few coding agents yourself and wonder whether your experience is typical.

This repository is built mostly by scheduled AI coding sessions. Each one writes a small JSON record of what it did. A group of research projects, the ones whose names start with `swe-` (40 of them when this was written), treats those records, the pull requests and the git history as a dataset. They call it track 10, the software-engineering loop. Its stated metric is valuable, correct work per unit of compute.

## The problem, in your words

"Our agent bill went up and nobody can say which runs caused it." "Is a pricier model worth it for this kind of task?" "The vendor says the agent merges most of its PRs. Most of what?" "We changed the prompt and things felt better. Did they?"

These are hard to answer from one team's dashboard. The `swe-*` projects try to answer them for one fleet, in public, with the code and the data snapshot beside each claim.

## What you get

Each project asks one question, answers it from `prompts/runs/` (one JSON file per run), from `main`'s history or from closed pull requests, and says how far the answer can be trusted. A sample of what they found, each figure from that project's README:

- **What a run costs.** `swe-runcost`: 355 priced runs from 14 to 18 October 2026 had a median of $0.68 and cost $337 together. The figure is an API-equivalent estimate, not a bill.
- **Cost per merged pull request.** `swe-costpermerge`: of 366 priced runs, 273 name a pull request that is on `main`. Total spend over merged runs comes to $1.26 per merged run, against $0.94 per priced run. The README calls that an upper bound, because some runs with no PR on record may have landed.
- **Where the dollars go.** `swe-cachecost`: in the median run, cache reads are 45% of the cost and one-hour cache writes 41%. Output, thinking included, is 13%. A large starting context, re-read on every request, explains most of the shape.
- **A cheap predictor.** `swe-callcost`: tool-call count alone predicts a run's dollars with a median error of 9% on held-out runs. Cost per call sat near $0.03.
- **Drift.** `swe-costdrift`: research runs got about 5% more expensive per day over six days, because they took more steps. Venture runs showed no drift.
- **Model choice.** `swe-modelmix`: an Opus run cost about 8 to 9 times a Sonnet run in the same track. The ledger held too few Opus runs to say whether the extra cost bought more. Detecting a 50% difference in output would need about 129 runs per arm.
- **How work lands.** `swe-prflow`: 460 of 526 closed pull requests merged (87.5%), with a median of 0.6 minutes from opening to merge. `swe-prlifetime` found 80% of research PRs merged within 5 minutes of being opened.
- **Do the records tell the truth?** `swe-reccover`: every pull request a record names, 522 of 522, is on `main`. But about one landed session in five left no record.
- **Do results reproduce?** `swe-audit` re-ran 40 sampled research projects. 36 reproduced, and none that finished gave different numbers.
- **What goes wrong.** `swe-errors`: 17.0% of 1,027 runs recorded at least one error, and those runs ended `partial` about twice as often. `swe-friction` counted the documentation complaints runs log and found 39% of them on two files.

There are also offline simulations, marked as stylised in their titles. `swe-allocate`, `swe-decay`, `swe-bootstrap` and `swe-warmstart` replay which track a run should pick. `swe-schedule` models duplicate work when runs start in the same minute. `swe-prompt` asks when a prompt A/B test may stop safely. Its answer: checking a plain z-test after every pair of runs declared a do-nothing change a winner in 21.3% of simulated experiments, against 5.3% for a single look at the end.

## Your first ten minutes: rerun cost per merge

You do not need the multi-gigabyte history. A sparse clone fetches one project:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo.git
cd oss-monorepo
git sparse-checkout set research/swe-costpermerge
cd research/swe-costpermerge
PYTHONPATH=src python3 -m unittest discover -s tests -v    # 6 tests
python3 experiments/run.py > experiments/results.txt
git diff --stat experiments/                                # empty means you matched
```

It is standard-library Python and runs from a committed snapshot. When this guide was written, the six tests passed and the run rewrote `results.txt` byte for byte, in under a second. Rebuilding the snapshot itself needs a full clone; its README says how.

Then:

1. **Read the record format.** `prompts/runs/README.md` explains the one-file-per-run design and which command writes and validates the fields.
2. **Open one run record** in `prompts/runs/` on GitHub. Look at `outcome`, `errors`, `doc_friction`, `deviations` and the `usage` block, if it has one.
3. **Pick the question closest to yours** from the list above. Open that project's page at `https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/<slug>/`, for example [the cost-per-merge page](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/swe-costpermerge/).
4. **Read the caveat line under its title before the headline.** Most say "preliminary" and name the window.

## How to read these numbers honestly

- **Short windows.** Most studies cover a few days to three weeks of October 2026. The fleet and its rules changed during that time.
- **Self-reported fields, and gaps in them.** `swe-fieldfill` found cost fields on about 47% of 1,362 records, mostly from 16 October on. `merged` was filled on 4.6%, so merge outcomes come from git instead.
- **Cost is estimated.** Dollar figures are recomputed from token counts at list prices in `prompts/pricing.json`. They are not invoices.
- **Observational, not randomised.** `swe-briefab` compared two prompt versions and found an apparent drop in errors. It then traced the drop to differences in task mix, not to the brief. Model, date and task are often confounded.
- **The labeller is the subject.** Where entries were hand-labelled (`swe-errlabel`, `swe-nullrate`), the labeller was the same kind of model that wrote the records. The READMEs say so.
- **Cost per merge is not value per merge.** A merged run can be a small fix or a whole project. `swe-value` tried to score project value with two automated passes and found they barely agreed (kappa 0.07). It reports that as a negative result.

## How to get involved

The most useful contributions from this audience are checks and comparisons:

- **A second labeller.** `swe-errfix` says its cheapest fix is more hand labels from a second labeller, not more rule tuning. Sixty entries is a small, finite job.
- **Your own numbers.** If you log agent runs, a field report comparing your cost per merge or error rate with these is useful, even if it disagrees.
- **A correction.** If a figure here does not match its `experiments/results.txt`, or a method is wrong, file a [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml) with the project slug and the line.
- **A question worth studying.** Suggest one with a [feature request](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml). There is no promise it gets picked up.

Pull requests from forks are reviewed by the maintainer by hand. The agents never review, merge or run a fork pull request, and they read outside issue text as information, not instructions.

## Cost and data

Everything is MIT licensed and free to rerun. The run records are public in the repository, as are the snapshots each project reads, so you can check a figure without asking anyone for access. Rerunning a project costs you a few seconds of CPU; rebuilding a snapshot from git needs a full clone, which is several gigabytes.

## What it does not do

- It studies one fleet, one repository, mostly one model family and one owner's rules. It may not transfer to your team.
- It does not measure working time well. `swe-branchlife` notes that commits are written when a session ends, so the minutes-long PR lifetimes leave real working time invisible.
- It does not say whether the merged work was useful to anyone. Usage of the products is a separate, mostly unmeasured question.
- It is not peer reviewed, and it is not advice on staffing, budgets or vendors.

## Where to go next

- The run records and their format: `prompts/runs/README.md`
- How the fleet is routed, recorded and reviewed: `prompts/README.md`
- The projects themselves: `research/swe-*`, each with `experiments/results.txt`
- Running the same process on your own repository: [Start here: run agents on your own repo](2026-10-30-start-here-run-agents-on-your-own-repo.md)
- How to reproduce and cite any research project: [Start here: the open research](2026-10-29-start-here-research.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).

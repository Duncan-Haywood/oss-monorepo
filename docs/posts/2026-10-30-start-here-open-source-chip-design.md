---
title: "Start here: open-source chip design research on Yosys, OpenROAD and SKY130"
seo_title: "Open-source chip design research: Yosys, OpenROAD, SKY130"
date: 2026-10-30
tags: [start-here, chip-design, eda, sky130, multi-fidelity]
description: "For hardware engineers and students on open flows: when a cheap synthesis estimate ranks designs like routed SKY130, with replayable data and code."
---

# Start here: open-source chip design research on Yosys, OpenROAD and SKY130

This guide is for people who push RTL through open tools. You might be a hardware engineer who uses Yosys and ABC at work and wonders how far to trust the synthesis report. You might be a student with a SKY130 class project, or a Tiny Tapeout design, and a laptop that takes minutes per place-and-route run. Or you might build search loops, by hand, with a script or with a language model, that try many flow settings and keep the best.

The repository holds an open research programme for you, `research/verified-dse`, and about eighty smaller `chip-*` and `eda-*` projects around it. The programme's page is [on the live site](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/verified-dse/).

## The problem, in your words

"Synthesis says this ABC script is best. Will it still be best after placement and timing repair?" "I cannot afford to route fifty variants, so I rank them on the mapped netlist and hope." "Somebody's paper says their search beats random. At equal wall-clock time?"

Every open flow has cheap and expensive views of the same design. A generic-gate count takes a fraction of a second. A liberty-mapped netlist takes a little more. Placement, global routing and timing repair cost the most. The programme calls these views *rungs* and asks a plain question: when you rank candidates on a cheap rung, how often do you pick the wrong one, how much does it cost you, and can a small amount of routed data tell you when to trust the cheap rung?

## What you get

- **A measured answer on real tools.** Milestone 1 ran 10 small designs (adders, a multiplier, a MAC, an ALU, popcount, a barrel shifter, CRC-16, a saturating comparator and a FIFO) through 60 ABC pass sequences each at two clock targets: 1,200 runs on Yosys, ABC and OpenROAD with the SKY130 HD library. The score is area x period.
- **A clear headline.** The generic-gate rung does not rank like the routed one: median Kendall tau-b of -0.04 at the tight clock, below 0.7 on all 9 designs where it is defined. Its pick costs a median 13.5% of routed area x period. The liberty-mapped rung does well at a relaxed clock (median pick regret 0.0%) but mis-ranks at a tight one (median tau 0.59, median regret 10.5%), because timing repair, which only later rungs see, reorders the designs.
- **Equal-budget baselines.** Searches are replayed on the cached tables at equal wall-clock time. A one-shot screen on a cheap rung, plain successive halving, Hyperband, and ridge, Gaussian-process and TPE surrogates were all tried. The README states that none of the surrogate baselines beats simply not cutting on the mapped rung.
- **Results that went the other way, kept.** Proof-success prediction (H5) is written up as not supported: across 752 SAT-miter proofs, proof time was set by design size, not by the rewrite. A conformal shortlist holds its coverage on the mapped rung (the routed optimum kept 0.99 of the time at nominal 0.90) and fails on the generic-gate rung (0.65 at nominal 0.80), so H4 is refuted there.
- **Theory with its limits stated.** A short proof bounds halving's routed regret by the sum of the cut rungs' worst ranking inversions. The log shows it is vacuous for the generic-gate rung and loose for the mapped one. The newest milestones, dated 2026-10-30, build a counterexample showing that no quantile below the maximum can turn that bound into a theorem, and measure how often the routed optimum stays inside the survivors of each cut (11 of 40 table cells).
- **A paper draft.** `PAPER.md` is a draft aimed at MLCAD. It is not submitted; submission is a step only the owner takes.

## Your first ten minutes

You do not need OpenROAD to check the numbers. The routed runs are cached in the repository, and the analysis is standard-library Python.

1. **Read the question and the table.** Open `research/verified-dse/README.md`. The first table gives each rung's cost per point and how well it ranks against routed area x period.
2. **Fetch only what you need.** The full history is several gigabytes, so use a sparse clone. The analysis imports a parser from `chip-pnr`, so add that project too:

   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo.git
   cd oss-monorepo
   git sparse-checkout set research/verified-dse research/chip-pnr
   cd research/verified-dse
   ```

3. **Run the rank-statistics tests.** `python3 -m unittest tests.test_stats tests.test_bound -v`. When this guide was written, those 17 tests passed in under a second. The third test file, `test_proof_success.py`, needs `numpy` and `scikit-learn`.
4. **Re-derive milestone 1 from the cached table.** `python3 experiments/rung_bias/analyse.py` reads `experiments/rung_bias/results.jsonl` and rewrites `results.txt` and `summary.json`. It took about 25 seconds here. The summary lines should read "tight r1: tau < 0.7 on 9 of 9 designs; median tau -0.04; median regret 13.5%" and "tight r2: tau < 0.7 on 6 of 10 designs; median tau 0.59; median regret 10.5%".
5. **Compare.** `git diff --stat experiments/`. In this guide's run the only differences were floating-point noise: a pick regret of `-0.0` printed as `0.0` for the ripple adder, and trailing digits in `summary.json`. Anything larger is worth reporting.
6. **Skim the log.** `LOG.md` is newest first. Each entry writes down the prediction before the run, then the outcome, including when the prediction failed.

`reproduce.sh` regenerates every number in the paper draft from the cached tables. It needs `numpy` and `scikit-learn`, and some steps take many minutes.

## If you have OpenROAD

The README's "Reproduce" section rebuilds the table from scratch: `research/chip-pnr/fetch_pdk.sh` fetches the SKY130 platform files at a pinned OpenROAD-flow-scripts commit, and `experiments/rung_bias/run.py` drives Yosys 0.33 and OpenROAD. The README estimates about 40 minutes on 4 cores. The programme's own sessions often run without OpenROAD; the latest agent note says that is what blocks more designs. So a machine with the tools is the most useful thing you could bring.

## How to get involved

The most useful contributions from this audience are measurements and corrections.

- **Run the flow on a design the programme lacks.** The open questions in `LOG.md` include detail routing (all "routed" numbers here are global-route estimates) and a fanout sweep on the `fanao` design. A results file from your machine, with tool versions, is real evidence.
- **Check a second corner.** Milestone 24 found that routed rankings carry over poorly to SKY130 ss_100C_1v60 (median Spearman 0.69 between corners). Another corner, another utilisation or another PDK would test how general that is.
- **Correct us.** If a tau, a regret or a claim about ABC or OpenROAD looks wrong to someone who runs these tools daily, say so with the file and line.
- **Suggest a design family** that should break the cheap rung. The `hostile` and `fanout_rich` experiments, with wiring-dominated and high-fanout designs, were built to test exactly that.

Send a finding or an idea through [the feature form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml), or a wrong number through [the bug form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml). Pull requests from forks are welcome; the maintainer reviews them by hand, and the AI agents never act on fork pull requests. An idea is read and weighed, but nobody promises it will be run.

## Cost and data

The code is MIT licensed and free. The designs written for the programme are MIT too. The SKY130 platform files are fetched from OpenROAD-flow-scripts at a pinned commit and are not copied into the repository; they keep their own licence (Apache-2.0, per that repository). Everything runs on your machine. Nothing is uploaded.

## What it does not do

- **It is small.** The core table is ten small designs, one of them a FIFO, with pools of about 50 pass sequences each. Later milestones add larger and wiring-heavy designs, but it is still a research benchmark, not a survey of industrial blocks.
- **"Routed" is an estimate.** It means OpenROAD global routing plus `repair_timing -setup`, not detailed routing or signoff.
- **One tool version and mostly one corner** (tt 25C 1.8 V at 40% utilisation, with one ss corner and one 65% operating point added later).
- **No new search method wins yet.** The honest summary so far is that the cheap rung is biased, and that simple baselines are hard to beat at equal wall-clock time on this table.
- **It is not engineering advice.** Nothing here tells you a chip is ready to tape out. It was produced by AI coding agents with the owner steering, and it claims no affiliation with any lab, tool project or author it cites.

## Where to go next

- The programme: `research/verified-dse/README.md`, `PROPOSAL.md` (12 checked related works, hypotheses H1 to H5) and `LOG.md`
- The paper draft: `research/verified-dse/PAPER.md`
- Short notes for the next session: `docs/reports/verified-dse-milestone-*.md`
- Where it started: `research/chip-toolchain` (the open front end and its tool versions) and `research/chip-pnr` (how far synthesis estimates sit from placed-and-routed numbers)
- Searching ABC pass sequences on a SKY130 MAC: `research/chip-scriptsearch`; a shared, cached design-loop harness: `research/eda-harness`
- All open programmes: `research/PROGRAMMES.md`
- How to rerun, reuse and cite any project: [Start here: the open research](2026-10-29-start-here-research.md)
- How outside contributions land: [Start here: contributing](2026-10-29-start-here-contributing.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).

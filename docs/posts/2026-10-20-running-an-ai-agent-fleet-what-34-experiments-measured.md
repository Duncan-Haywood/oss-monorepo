---
title: "What 34 experiments on our own AI agent fleet measured"
date: 2026-10-20
description: "Cost per run, duplicate work, merge conflicts, record coverage and whether committed results reproduce: 34 small studies of an unattended coding-agent loop."
tags: [research, ai-agents, software-engineering, cost, open-source]
---

# What 34 experiments on our own AI agent fleet measured

This repository is built mostly by AI coding agents that start on a schedule,
pick a task, open a pull request and merge it. Track 10 of
[`research/PROJECTS.md`](../../research/PROJECTS.md) (`research/swe-*`) points
the repository's own tools at that loop: 34 small projects, each a directory
with a stdlib-Python script, a committed `experiments/results.txt` and a README
that states its limits.

**Who did this.** The agents themselves, unattended, under the owner's
direction. The loop is measuring itself, so every figure is a measurement of
this one repository over days to a few weeks, not a claim about agents in
general. Most projects are marked preliminary, and so are the numbers below.

## 1. What a run costs

[`swe-runcost`](../../research/swe-runcost/) priced 355 runs over 14 to 18
October. The median run cost **$0.68** (95% bootstrap interval $0.64 to $0.72)
and together they cost $337. These are API-equivalent estimates, not a bill.

- Spend is only mildly concentrated: the top 10% of runs hold 36% of the money.
- Cost grows faster than the work. With tool calls the exponent is 1.18 and
  with input tokens 1.37, so a run with twice the tool calls reads about 2.6
  times the input. That is what a growing conversation re-read at each step
  would produce, though the data cannot separate it from harder runs being
  longer. Recorded wall time is a poor guide (exponent 0.36).

[`swe-costpermerge`](../../research/swe-costpermerge/) joined cost to outcome:
of 366 priced runs, 273 (75%) name a pull request on `main`. A merged run cost
**$1.26** on average against $0.94 per priced run, because 19% of spend sits on
runs with no merged PR on record. Most of those 92 are a recording gap rather
than failed work (all 34 red-team runs name no PR yet their PRs are on `main`).

[`swe-modelmix`](../../research/swe-modelmix/) found an Opus run costs 8 to 9
times a Sonnet run in the same track, and that telling whether it buys more
output would take about 129 runs per arm to detect a 50% difference. The
ledger held 12 Opus runs, so the question is open.

## 2. Parallel starts waste work

Scheduled sessions overlap. [`swe-schedule`](../../research/swe-schedule/)
simulated it: with four runs picking one of 11 tracks blindly, **12.8% of runs
duplicate another's item**, and checking claims barely helps when all four
start in the same minute, because none has pushed yet. Staggering starts by
more than the claim latency or handing each run a slot from the scheduler
removes the waste.

Git agrees with the simulation. [`swe-reviewdup`](../../research/swe-reviewdup/)
found 6 of 35 review PRs (17.1%, Wilson 8.1% to 32.7%) were the second of a
pair merged within 10 minutes of another. [`swe-prflow`](../../research/swe-prflow/)
found that PRs opened within 10 seconds of the previous one merged 60.0% of the
time against 92.0% for the rest. That is an association: bursts may differ in
kind from other PRs.

## 3. Shared files collide

[`swe-sharedfiles`](../../research/swe-sharedfiles/) found 64.4% of research
merges edit the same two index files. A branch open for 30 minutes sees them
move in about half of cases, and replayed merges conflicted textually in 18.6%
of pairs landing within 30 minutes. Cheap to fix (merge `main`, rerun the
build), but it taxes every parallel run.

## 4. Do the committed results reproduce?

[`swe-audit`](../../research/swe-audit/) re-ran a seeded sample of 40 of the 386
projects that ship an experiment script. **36 reproduced (90%, Wilson 77% to
96%)**, 34 byte-identical and 2 differing in one timing line. Three timed out
and one needed a model file that is not in the repository. None of those that
finished gave different numbers. A first pass reproduced only 26 of 40, mostly
because of missing packages or undocumented sibling-project paths, a reminder
that "reproduces" depends on the environment. Of 713 numbers in 35 READMEs,
85% appear verbatim in a committed results file.

## 5. The records are not complete

[`swe-reccover`](../../research/swe-reccover/) checked run records against git.
Every PR a record names is on `main` (522 of 522), but **only 79.8% of sessions
that landed commits left a record**. Sessions that followed the master prompt
have one 89.8% of the time, others 4.2%. Ventures is the weakest track at 79.2%.
So any per-track cost or throughput figure covers the sessions that recorded
themselves.

## 6. Allocation: a modest, fragile gain

[`swe-allocate`](../../research/swe-allocate/) replayed four policies for
choosing which track the next run works on, on a 20,000-line budget. A greedy
rule and Thompson sampling scored about 130 to 137 value points against 99 for
uniform. [`swe-decay`](../../research/swe-decay/) showed finite pools eat part of
that, and [`swe-bootstrap`](../../research/swe-bootstrap/) showed the lead holds
at 20,000 lines (greedy +33 over uniform, interval 15 to 53) but not at 5,000.

The value scores themselves are weak. In [`swe-value`](../../research/swe-value/)
two automated passes agreed at chance level (weighted kappa 0.07), so the
allocation result is a stylised replay, not advice.

## 7. Can an experiment on the prompts stop early?

[`swe-prompt`](../../research/swe-prompt/) simulated prompt A/B tests. Reading a
z-test after every pair of runs declared an identical brief different in
**21.3%** of experiments on success rate, and 40.5% on project value, against
5.3% for one look at the end. A mixture sequential test stayed at or below
nominal. The success rate (97%) is also a poor metric: a 2-point change needs
thousands of runs.

## 8. Negative results are common

[`swe-nullrate`](../../research/swe-nullrate/) hand-labelled 80 project
summaries. Of the 39 that test a claim against an alternative, 59% report a
negative or mixed result. 91% of all 711 summaries carry a limitation word,
which counts a disclosure habit and does not check that the right limitation
was named.

## What this changes

- Stagger scheduled starts or assign slots; both cost nothing and cut duplicates.
- Put the run-record step in every track's prompt, so cost figures stop
  excluding a fifth of the work.
- Do not stop prompt experiments by peeking.

Everything is reproducible from the directories linked above. The research
index is at [`research/`](../../research/), and the other tracks are written up
in [chip design](2026-10-20-chip-design-loops-what-35-open-experiments-found.md)
and [house construction cost](2026-10-20-house-construction-cost-what-35-open-models-found.md).

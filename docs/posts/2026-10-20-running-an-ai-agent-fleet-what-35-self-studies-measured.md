---
title: "Running an AI coding-agent fleet: what 35 self-measurements found"
date: 2026-10-20
description: "Cost per run and per merged PR, duplicate agents, merge conflicts, record coverage and reproducibility, from 35 studies of one agent repository."
tags: [research, ai-agents, software-engineering, cost, measurement]
---

# Running an AI coding-agent fleet: what 35 self-measurements found

This repository is worked on by scheduled AI coding agents (Claude sessions),
with its owner steering. One research track, the software-engineering loop
([`research/PROJECTS.md`](/research/PROJECTS.md), track 10), turns the lens on
that process: what do the runs cost, how often do they collide, can their
records be trusted, and do their results hold up when re-run? It has 35
`research/swe-*` projects. Each README has a method, a limitations section and
a reproduce command; every number below is copied from one.

The caveats come first. This is one repository over a few weeks of October
2026, mostly one model, and nearly every project is labelled preliminary.
Costs are API-equivalent estimates from transcripts, not invoices. Most
findings are observational. Treat them as measurements of this fleet, not as
benchmarks for yours.

## 1. A typical run costs about 68 cents, and cost grows faster than the work

[`research/swe-runcost/`](/research/swe-runcost/) priced 355 runs. The median
was $0.68 (bootstrap interval $0.64 to $0.72), the mean $0.95, the total $337.
Spend is only mildly concentrated: the top 10% of runs hold 36% of the money.

Cost scales with tool calls with exponent 1.18 (1.11 to 1.25) and with input
tokens with exponent 1.37 (1.30 to 1.42), so a run with twice the tool calls
reads about 2.6 times the input. That is what a growing context re-read at
each step would produce, though the data cannot separate it from longer runs
being harder. Recorded wall minutes predicted cost poorly (exponent 0.36), so
tool calls are the better guide.

A sibling, [`research/swe-spendoutput/`](/research/swe-spendoutput/), asked
whether a bigger run buys more output. Across 157 runs that added tests, cost
and tests added correlate (Spearman rho +0.57), but tests per dollar do not
rise with spend: 5.4 in the cheapest third of runs, 6.0 in the middle, 3.7 in
the dearest. Tests added is a crude output measure, and 79% of records leave
it empty.

## 2. Per merged pull request, about $1.26, with a large recording gap

[`research/swe-costpermerge/`](/research/swe-costpermerge/) joined 366 priced
runs to `main`'s merge history. 273 (75%) name a pull request that is on
`main`. Total spend over merged runs gives $1.26 each (bootstrap 1.08 to
1.49), an upper bound because runs with no PR on record may have landed. By
track: research $1.03, ventures $1.10, review $0.76, and process $2.52, with
the widest interval.

The 92 runs with no PR are mostly a recording gap: all 34 red-team runs name
none, yet red-team PRs are on `main`.

## 3. The records are reliable where they exist, and missing for one session in five

[`research/swe-reccover/`](/research/swe-reccover/) checked the run records
against git. Every pull request a record names in this repository is on
`main`: 522 of 522. The other direction is weaker. Since 13 October, 79.8% of
sessions that put commits on `main` have a run record (1,465 of 1,836).
Sessions that followed the master prompt have one 89.8% of the time; sessions
that did not, 4.2%. Ventures sessions are the worst-covered track at 79.2%.
So any per-track cost or throughput figure describes the sessions that
recorded themselves.

[`research/swe-errors/`](/research/swe-errors/) read the free-text error
field: 17.0% of runs (175 of 1,027) record at least one. By keyword rules the
largest group is environment and tooling (27.9%: interpreter mismatches,
shallow clones, missing packages), then the run's own mistake caught before
commit (21.2%) and collisions with a parallel run (17.1%). Runs that record an
error end `partial` twice as often (12.6% against 6.0%).

## 4. Parallel agents do duplicate each other, but less than feared

Scheduled sessions overlap. [`research/swe-reviewdup/`](/research/swe-reviewdup/)
looked at 35 review PRs merged over six days: six (17.1%, Wilson 8.1% to
32.7%) were the second of a pair merged within 10 minutes of another review.
All six pairs merged 0.4 to 2.5 minutes apart, which means sessions that
started together. Five of six pairs edited the same generated file, so the
later merge had a conflict to resolve.

On research merges the shared index files are the collision point. From
[`research/swe-sharedfiles/`](/research/swe-sharedfiles/): 65 of 101 merges
edit both `research/README.md` and `research/_homepage/projects.json`, and
replaying them as if they had been open longer gave textual conflicts in 18.6%
of pairs landing within 30 minutes. The follow-up
[`research/swe-prlifetime/`](/research/swe-prlifetime/) replaced that assumed
window with real lifetimes: the median research PR was open 0.9 minutes
(p90 16.0), and replayed from real creation times only 2 of 58 (3.4%, Wilson
1.0% to 11.7%) conflicted. Agents open the PR at the end of the work and merge
at once, so the collision cost is an order of magnitude below what the
30-minute assumption suggested.

## 5. Do the committed results reproduce?

[`research/swe-audit/`](/research/swe-audit/) re-ran a seeded sample of 40 of
the 386 projects that ship an experiment script and committed output. 34 were
byte-identical, 2 differed in a timing line only, 3 timed out at 300 seconds
and 1 needed a voice model not in the repository. That is 36 of 40 reproduced
(90%, Wilson 77% to 96%), and no project that finished gave different numbers.
The first pass reproduced only 26 of 40: nine failures were missing packages
or an undocumented path into a sibling project, which is the sort of failure a
stranger cloning the repo would hit too.

Is a portfolio written by agents only a list of wins?
[`research/swe-nullrate/`](/research/swe-nullrate/) hand-labelled 80 random
summaries: 51% descriptive, 20% positive, 18% mixed and 11% negative. Among
the 39 that test a claim against an alternative, 59% report a negative or
mixed result, for example a co-designed robot arm that beat a fixed one by 1.9%,
within seed noise.

## 6. What did not work

- **Valuing projects automatically.** [`research/swe-value/`](/research/swe-value/)
  scored 408 projects with two automated passes. They agreed at chance level
  (linear-weighted kappa 0.07), and a flaw in one was found after the fact.
  The track's own conclusion is that the rubric is too weak to base an
  allocation policy on.
- **Choosing a model by cost alone.** [`research/swe-modelmix/`](/research/swe-modelmix/)
  found an Opus run costs 8 to 9 times a Sonnet run in the same track, but the
  ledger cannot say if it buys more: detecting a 50% difference in projects
  per run needs about 129 runs per arm.
- **Deviations as a quality signal.** In
  [`research/swe-deviations/`](/research/swe-deviations/), runs that list a
  deviation from the brief cost about 1.2 times as much and take 1.6 times as
  long within track, but the cost gap rests largely on the process track.

## What to take from it

- Log tool calls, not wall time, if you want to predict what a run costs.
- Check your run records against git before trusting any per-track figure;
  here, one landed session in five left none.
- Parallel agent starts do collide, but opening the PR at the end of the work
  and merging at once kept real conflicts rare.
- Re-run a sample of your own committed results. Ten percent did not
  reproduce at first, mostly for undocumented dependencies.

The code, data and reproduce commands for every figure are in the linked
project directories, and the track's other studies (stopping rules for prompt
experiments, schedule models, an engineering-organisation catalogue) are
listed in [`research/PROJECTS.md`](/research/PROJECTS.md).

---
title: "Measuring an AI coding agent fleet: run cost, duplicate work, reproducibility and self-reports"
seo_title: "Measuring an AI coding agent fleet"
date: 2026-10-20
description: "32 research projects measure the AI agent loop that builds this repository: what a run costs, how often work duplicates, and whether results reproduce."
tags: [research, ai-agents, software-engineering, measurement, operations-research]
---

# Measuring an AI coding agent fleet: run cost, duplicate work, reproducibility and self-reports

This repository is built mostly by unattended AI coding agents (Claude Code,
Cursor, Kilo and GitHub Actions bots), with the owner steering a few hours a
week. One of its research tracks turns the measuring tools on that loop. Track
10 (`swe-*`, 32 projects so far) treats the briefs as the design, each run as
an evaluation and the merged projects as the output. Its goal is the most
useful, valuable and correct projects within a fixed compute budget. Its
brief is section 10 of [`research/PROJECTS.md`](../../research/PROJECTS.md).

The agents doing the work are also the subject, and that is the main caveat
for everything below. The data are the fleet's own run records
(`prompts/runs/`), git history and pull requests. Some labels were made by the
same model family that wrote the records. Every project is marked preliminary,
and most cover a few days.

## 1. Committed results mostly reproduce

[`swe-audit`](../../research/swe-audit/) re-ran a seeded random sample of 40 of
the 386 research projects that ship both a run script and a results file.

| outcome | projects |
|---|---|
| byte-identical to the committed results | 34 |
| differs in one timing line only | 2 |
| timed out at 300 s | 3 |
| could not run (missing voice model) | 1 |

That is 36 of 40 reproduced (90%, 95% Wilson interval 77% to 96%). No project
that finished gave different numbers. The environment mattered: a first pass
with fewer packages installed reproduced only 26 of 40. And of 713 decimal
numbers in 35 sampled READMEs, 604 (85%) appear verbatim in a committed
results file. The rest are mostly derived values, so this is a traceability
measure, not an error rate.

## 2. What a run costs

[`swe-runcost`](../../research/swe-runcost/) priced 355 runs from 14 to 18
October. The median run cost $0.68 and all 355 cost $337, as an API-equivalent
estimate rather than a bill. Cost grows faster than the work: doubling the tool
calls means reading about 2.6 times the input tokens. That fits a growing
context being re-read at every step.
[`swe-costpermerge`](../../research/swe-costpermerge/) joined cost to git and
found $1.26 per merged run, against $0.94 per priced run. Process-track runs
cost $2.52 per merged run, about 2.4 times a research run. These are one
repository's estimates, not a pricing guide or financial advice.

[`swe-modelmix`](../../research/swe-modelmix/) found an Opus run costs about 8 to
9 times a Sonnet run in the same track. The log cannot yet say whether it buys
more. Detecting a 50% difference in projects per run would need about 129 runs
per arm.

## 3. Parallel runs duplicate each other, and a scheduler fix is cheap in theory

Several sessions often start in the same minute.
[`swe-schedule`](../../research/swe-schedule/) modelled four runs, each
picking one of 11 tracks at random. Its timing constants are assumptions:

- With no coordination, 12.8% of runs duplicate another.
- Checking for claims barely helps when starts are simultaneous (11.2% to
  12.6%), because every run reads the repository before any has pushed.
- A 5-minute stagger cuts it to 1.6% when claims take 3 minutes to appear.
  Handing each run its own slot removes it entirely.

The measured side agrees in direction. In [`swe-prflow`](../../research/swe-prflow/),
pull requests opened within 10 seconds of another merged 60.0% of the time,
against 92.0% for the rest. That is an association, not proof of cause.
[`swe-reviewdup`](../../research/swe-reviewdup/) found that 6 of 35 review pull
requests were the second of a pair merged within 10 minutes of each other.

Merge conflicts on shared files turned out smaller than feared. Pull requests
stay open a median of 0.9 minutes
([`swe-prlifetime`](../../research/swe-prlifetime/)), and only 2 of 58 that edit
the shared index files conflict when replayed (3.4%). The file that collides
most is `research/PROJECTS.md` itself: 5 of the 44 pull requests that edit it
conflict there, or 11.4% ([`swe-branchlife`](../../research/swe-branchlife/)).

## 4. Self-reports are uneven, and the gaps are measurable

- **Some fields look too clean.** In [`swe-ledger`](../../research/swe-ledger/),
  all 143 runs that filled in `ci_failures_before_green` reported 0.
- **Some claims check out.** [`swe-reccover`](../../research/swe-reccover/)
  found every pull request a record names is on `main`: 522 of 522.
- **Some sessions leave no record.** From 13 October, 79.8% of sessions that
  put commits on `main` have a run record. For ventures sessions it is 79.2%.
  [`swe-ventgap`](../../research/swe-ventgap/) traced one likely contributor:
  the ventures sub-prompts never mention the record step.
- **Documentation friction is concentrated.** In
  [`swe-friction`](../../research/swe-friction/), 57% of 1,015 records list a
  problem with the instructions. `CLAUDE.md` (165 entries) and
  `research/PROJECTS.md` (112) account for 39% of them.

## 5. The portfolio reports its losses

A fleet grading its own work could drift toward reporting only wins.
[`swe-nullrate`](../../research/swe-nullrate/) hand-labelled 80 random project
summaries. Among the 39 that test a claim against an alternative, 23 (59%)
report a negative or mixed result. 91% of all 711 summaries carry a
limitation word such as "stylised" or "preliminary".

## 6. Value is hard to score, so budget allocation is not ready

The track wants to steer the budget toward the tracks that produce the most
value. That needs a value score, and [`swe-value`](../../research/swe-value/)
found its two automated scoring passes barely agree (Cohen's kappa 0.07, chance
level). On those weak scores, offline replays
([`swe-allocate`](../../research/swe-allocate/),
[`swe-decay`](../../research/swe-decay/),
[`swe-bootstrap`](../../research/swe-bootstrap/)) find a greedy policy beats
the current uniform track draw by +33.4 value points at a 20,000-line budget.
The 95% interval is 15.0 to 52.6 across resampled histories. The projects
themselves say this must not drive a policy yet.

Prompt experiments face a related trap. [`swe-prompt`](../../research/swe-prompt/)
simulated reading a z-test after every pair of runs. A brief identical to the
champion was declared different 21.3% of the time on success rate, against 5.3%
with one look at the end. Success rate is also nearly useless as a metric: at
a 97% base rate, detecting a 2-point gain takes about 2,188 runs. The one real
comparison, [`swe-briefab`](../../research/swe-briefab/), found an apparent
drop in errors for brief v1 (7.5% against 17.0%) that vanished once task mix
was controlled for.

## 7. Practices from engineering organisations rarely transfer cleanly

[`swe-orgs`](../../research/swe-orgs/) is a cited catalogue of 59 practices from
engineering organisations. Only 4 rest on measurement; 29 rest on practitioner
accounts or books and 13 on opinion or a framework. Nineteen transfer cleanly
to a fleet of agent sessions. Its finding for now is negative: no practice
cleared its bar for a new proposal. Most assumptions that fail are about
people, such as headcount, on-call and reviewer latency.

## What to take from it

The cheap, solid results are about measurement itself. Results reproduce. Cost
can be priced. Duplicate work has a known shape. The record gaps are now
counted. The questions the track exists for are harder: which brief, model and
schedule land the most valuable work per subscription-week. They wait on a
trustworthy value score and on randomised trials the fleet has not run yet.

The companion post [Throughput per unit of supervision](2026-10-16-throughput-per-unit-of-supervision.md)
tells the same story from the owner's side.

---
title: "Work that takes more than twenty hours"
date: 2026-10-21
description: "Why agents here should aim at software a person could not write in a weekend, and the run records showing how rarely they have: 4 of 969 runs."
tags: [opinion, ai-agents, product, measurement]
---

# Work that takes more than twenty hours

*An opinion piece from the owner of this repository, with numbers from the
agents' own run records. The code here is written mostly by unattended AI
coding agents, with the owner steering.*

In my own words, from 21 October 2026:

> "i have a tentative opinion that it would be beneficial to work on projects
> that are hard enough that they can't be completed in 20 hours or less of
> human coding. like projects with enough depth that it takes real work to
> complete them. at least for software. not as a hard and fast rule, but the
> cost of creating software in the moment with coding agents makes it the case
> that its not necessarily worth publishing software that is less than lets
> say 15 minutes for a coding agent to code. I'm not saying not to per se. I'm
> just saying to work on harder heavier problems as a main focus rather than
> trivial problems."

## The argument

When a coding agent can write a small tool in a few minutes, anyone can
have that tool whenever they want it. They ask their own agent, and they
get one shaped to their problem rather than to ours. Publishing it adds
almost nothing. A unit converter, a one-formula calculator or a CSV
reformatter is now cheaper to make on demand than to search for.

What stays worth publishing is work that is still expensive to redo: a
solver that took a week to get right, a dataset someone had to collect, an
experiment with a negative result someone had to run, a product whose edge
cases were found by people using it. That is the stuff a reader cannot get
by asking.

So the rule of thumb is about cost to reproduce. If a competent person
could build the thing in under about twenty hours, or an agent in under
about fifteen minutes, it should not be the main thing we do. It is a
direction, not a ban. Small fixes, docs and the upkeep of tools people
already use still matter.

## What the run records say

Every agent session here writes a run record in
[`prompts/runs/`](../../prompts/runs/). Since 14 October, 973 of them carry a
measured `usage` block from
[`prompts/runcost.py`](../../prompts/runcost.py). That block has the
session's active minutes, read from its own transcript, and the agent's
estimate of how many hours a competent person would have needed, with the
basis written down. The time is measured. The human-hours figure is a
guess, and the tool labels it "low" certainty. Read the second column with
that in mind.

Across the 969 records that have both figures (14 to 20 October 2026):

| | 10th pct | median | 90th pct | 99th pct |
|---|---|---|---|---|
| Agent active minutes | 1.2 | 3.3 | 13.2 | 35.0 |
| Estimated human hours | 0.5 | 3 | 6 | 14 |

- **92% of runs took under fifteen active minutes.** By track, the share
  ranged from 86% (process work) to 100% (reviews). Research was 93% and
  products 91%.
- **99.6% were estimated at twenty human hours or less.** Only 4 of 969
  runs were above that. Two were research runs: a 2D cloth-drape solver
  with an optimisation loop, and a two-player search harness with a 32-run
  experiment. The other two were product runs that each built a
  multi-adapter tool.
- **Three in four runs (74%) were estimated at four hours or less.**

One run is not one project. A project can take many runs. So the same
records were summed by project, for the 247 projects that runs named. The
median project had five estimated human hours in total, and **5 of the 247
passed twenty**. The site builder led with 51 hours over 7 runs, then the
changepoint detector with 34 hours over 7 runs. Many runs leave the
`projects` field empty, so this count is rough. It still points the same
way.

By the owner's yardstick, then, nearly everything this fleet has made so
far is work an agent could redo in a few minutes. That does not make it
worthless. Some of it is used, and the research has found real things.
But the yardstick says where the next effort should go.

## What changes

The steering file every session reads,
[`prompts/goals.md`](../../prompts/goals.md), now carries this as part of
"Direction: depth over calculators":

- With a free choice, a session picks work that is still expensive to
  reproduce. That can be a milestone on one of the
  [flagships](../../portfolio/flagships.yaml), a research project, or a
  multi-session build. A new small tool comes last.
- A session sizes its work honestly before starting. If the plan is
  something it could finish in fifteen minutes and a person in an
  afternoon, the session should look for the harder version of that
  problem first.
- Big work spans sessions. Twenty hours of human work will not fit in one
  agent run. Each run should leave the next one a working step and a
  written plan, not a finished toy.
- The run records already hold the measurement, so the share of runs and
  projects above the line can be tracked over time. `runcost.py report`
  shows the per-run figures.

The honest risk is that "harder" turns into "bigger for its own sake". A
twenty-hour project nobody needs is worse than a five-minute tool someone
uses. The test stays the same as for everything here: real use and real
findings. The new part is the bar for what is worth starting.

*Figures from `prompts/runs/*.json` on `main`, 21 October 2026. Agent
minutes are measured from session transcripts. Human hours are each
agent's own estimate.*

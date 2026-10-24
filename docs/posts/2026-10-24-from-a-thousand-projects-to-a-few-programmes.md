---
title: "From a thousand research projects to a few research programmes"
date: 2026-10-24
description: "1,040 research projects with a median of 296 lines of Python. Why the bar moves to PhD-level programmes aimed at papers, and how it is enforced."
tags: [opinion, research, ai-agents, measurement]
---

# From a thousand research projects to a few research programmes

*An opinion piece from the owner of this repository, with numbers measured
from the repository itself. The code here is written mostly by unattended AI
coding agents, with the owner steering.*

In my own words, from 24 October 2026:

> I want the research we do to be bumped to hopefully being phd + in ambition
> and scope. deeper projects and research. publishable. doing step by step is
> still okay but the full scope is look at deeper harder more impactful
> problems.

And a few minutes later: "I think increase the requirements for it will be
beneficial."

## What the portfolio looks like

The open research portfolio under `research/` holds 1,040 project
directories. They are honest: each has tests, a README whose numbers come from
its own output, and checked citations. But they are small. Counting every
`.py` file in each directory:

| Measure | Value |
|---|---|
| Projects | 1,040 |
| Median lines of Python per project | 296 |
| 90th percentile | 485 |
| Projects over 2,000 lines | 2 |
| Projects keeping a research log | 2 |

Small is not the same as worthless, but the pattern shows in the titles. About
130 projects ending in `-twin` or starting with `twin-` each take one way a
biased simulator can mislead (a missing deadband, a lidar twin without fog, a
gyro without bias drift) and price it in a scalar model. More than twenty
`simdesign-*` projects probe the mesh behaviour of one laser-cut bracket. Each
answer is correct. Together they circle a question none of them asks: *how
should anyone use a biased simulator to make claims about a real robot, with a
guarantee?* That question is worth a thesis chapter. Each of the 130 answers,
on its own, is not.

The cause is structural, not a lack of effort. The instructions told each run
to "pick something you can finish and land in one run" and to put "one project
per pull request", and each follow-up got a fresh directory. About sixteen
runs start every hour, so a sentence like that turns into a thousand small
projects within a few weeks.

## What changes

The unit of research is now the **programme**: one hard, open question,
pursued across many sessions until it yields a paper ready for a named
peer-reviewed venue. The rules are in `research/PROGRAMMES.md`:

- **Most runs advance an open programme.** `pick_track.py` now draws a
  programme for about two runs in three. A run lands one real step (a proof, a
  stronger baseline, a check against real data, a section of the paper)
  inside the programme's directory, not in a new one.
- **A new programme starts with a proposal** that meets a written bar: the
  question and why it is open, at least ten related works read and checked,
  a gap stated narrowly enough to check, falsifiable hypotheses, the strongest
  published baselines, real data where it exists, milestones, and a target
  venue.
- **The research log comes before the result.** Each hypothesis and planned
  analysis goes into `LOG.md` before the experiment runs, which is the cheap
  version of preregistration.
- **A check holds the line.** `research/_shared/programme_check.py` runs in
  research CI. A directory created after today must be a programme with a
  complete proposal, name its programme, or say in one line why it stands
  alone. The 1,040 existing projects are exempt.

The first programme, `sim2real-inference`, is the twin question above. Its
proposal reconciles two results already in the repository that look like a
contradiction. One says a twin saves real trials in proportion to
`1/(1−ρ²)`. The other proves a twin cannot shorten a failure-rate
certificate without assumptions. It aims at CoRL, and it plans to test on
real paired simulation and robot results published by the SIMPLER authors,
not only on models we wrote. Four more rows sit in the table with no proposal
yet: verifiable-training mechanisms, low-communication training, verified
chip design-space search, and valid inference from LLM-coded qualitative
data. Each row's first session writes its proposal.

## What a higher bar does not change

Nothing here relaxes research integrity. A programme that falls short of its
venue says so. "Target venue" is an aim, not a claim of acceptance.
Submitting a paper is still an owner step, because it publishes under a name.
Small fixes and upkeep still count. The steps can stay small; the question
they serve should not be.

*Produced with AI assistance (Claude Code). Numbers from the repository on
2026-10-24; method in
[the agent report](../reports/2026-10-24-research-programmes.md).*

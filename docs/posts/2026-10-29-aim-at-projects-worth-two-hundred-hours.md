---
title: "Aim at projects worth two hundred hours"
date: 2026-10-29
description: "The owner raises the bar for what is worth starting from twenty human hours to two hundred. The run records show no project measured above 94."
tags: [opinion, ai-agents, product, research, measurement]
---

# Aim at projects worth two hundred hours

*An opinion piece from the owner of this repository, with numbers from the
agents' own run records. The code here is written mostly by unattended AI
coding agents, with the owner steering.*

In my own words, from 29 October 2026:

> "i think it makes sense to focus more on porjects that are at least
> estimated to be 200+ human equivalent hours worth of work."

Eight days ago the bar was twenty hours
([the earlier post](2026-10-21-work-that-takes-more-than-twenty-hours.md)).
This post argues for moving it by a factor of ten, and then looks at what
the records say.

## Why twenty hours is too low

Twenty hours was meant to rule out the weekend project: a calculator, a
converter, a single-formula page. It does that. But it no longer rules out
much else.

A single agent session here has already been estimated at 40 human hours.
A few sessions on one project clear twenty without anyone planning for it.
If one afternoon of agent work can pass the line by accident, the line is
not choosing anything.

Two hundred hours is about five working weeks for one competent person.
That is roughly the size of a small product that holds up when real people
use it, or the work behind one solid research paper. At that size a
project picks up things that are hard to redo:

- **Data someone had to collect**, such as a real bank export, a labelled
  set or a measured benchmark.
- **Edge cases found the hard way**, for example the bank file that breaks
  the parser or the state whose sales tax rule is different.
- **Experiments that were actually run**, including the negative results.
- **A design that has been through many sessions**, each one fixing what
  the last one got wrong.

None of that comes back when you ask a chatbot. A twenty-hour tool mostly
does. So the reasoning behind the first bar (publish what is costly to
reproduce) now points to a much higher one.

## What the run records say

Every session writes a run record in [`prompts/runs/`](../../prompts/runs/).
Some of them carry a `usage` block from
[`prompts/runcost.py`](../../prompts/runcost.py) with measured active
minutes and the agent's own estimate of the human hours involved. The
minutes are measured. The hours are a guess, and the tool labels them low
certainty.

From the 1,015 records with both figures (16 to 28 October 2026):

| | 10th pct | median | 90th pct | 99th pct | max |
|---|---|---|---|---|---|
| Estimated human hours per run | 0.5 | 3 | 6 | 12 | 40 |
| Agent active minutes per run | 1.2 | 3.3 | 13.3 | 35.0 | |

- **No single run reached 50 estimated hours.** Five passed 20.
- **Together, the 1,015 runs add up to about 3,570 estimated human hours,
  from about 102 hours of active agent time.** That is roughly 35 human
  hours for each agent hour.
- **Summed by project, 6 of 253 projects pass 20 hours and none pass
  200.** The largest is the site builder (`platform/pages`) at 93.5 hours
  over 8 estimated runs. The median project is 6 hours.

By that measure, nothing here has reached the new bar yet.

## The measurement has a blind spot

That last finding is weaker than it looks. Only 1,015 of the 3,710 run
records carry an hours estimate at all. The estimate is optional in
`runcost.py attach`, and only 46 of the 1,930 records dated after 20
October carry one, about 2%.

So the records go dark just where the deeper work started. The flagship
bookkeeper, [`ventures/ai-bookkeeper`](../../ventures/ai-bookkeeper/), is
named in 62 run records, more than any other project, and none of them
carries an hours estimate. Its source tree has about 27,000 lines of
JavaScript and Python, tests included. As a rough guide, at a common
rule of thumb of 10 to 20 tested lines per hour for a person, that would
be between 1,400 and 2,700 hours. Line counts are a poor measure: the
biggest venture by lines, a site generator at 170,000, is one the
flagship list calls "bloated" with a thin core. Still, it is very likely
that at least a few projects here have passed 200 hours and the records
cannot show it.

Only 29 of the 1,324 venture directories have 4,000 or more lines of
code. The median has 669.

## What changes

The steering file every session reads,
[`prompts/goals.md`](../../prompts/goals.md), now says this under
"Direction: depth over calculators":

- **The bar is 200 estimated human hours per project, not per run.** No
  session does 200 hours of human work. A project gets there over many
  sessions, so the question for each session is whether it is building
  toward such a project.
- **With a free choice, deepen a project that is already on that path**:
  a [flagship](../../portfolio/flagships.yaml) or a research programme in
  [`research/PROGRAMMES.md`](../../research/PROGRAMMES.md). Starting
  something new needs a written plan that a person would estimate at 200
  hours or more, and a first step that works on its own.
- **Write the estimate down.** `runcost.py report` now has a
  per-project table that adds up estimated hours and counts the runs
  with no estimate. That only works if sessions pass `--human-hours`.
- **Small work still counts.** Fixes, upkeep of tools people use, docs
  and write-ups like this one are not banned. They just aren't the main
  effort.

There is a real risk here. "Two hundred hours" can turn into "make it
big". Hours are an input, and padding a project to look large is easy,
especially when the estimator is the same agent that did the work. The
test is still what the earlier post said: real use and real findings.
What has changed is how large a project has to be before it is worth
starting.

*Figures from `prompts/runs/*.json` on `main`, 29 October 2026, via
`python3 prompts/runcost.py report`. Agent minutes are measured from
session transcripts. Human hours are each agent's own estimate. Line
counts are `.mjs`, `.js`, `.py`, `.ts`, `.tsx`, `.rs` and `.go` files
under each `ventures/` directory, excluding `node_modules` and `dist`.*

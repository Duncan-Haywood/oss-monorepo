---
title: "Progress, 21 to 24 October: 922 merges, 217 research projects, zero measured users"
date: 2026-10-24
description: "Three days of an AI agent fleet read from git and 820 run records: the flagship got the effort, but on made-up inputs, and nobody has measured a visitor."
tags: [ai-agents, measurement, progress-report]
---

# Progress, 21 to 24 October: 922 merges, 217 research projects, zero measured users

This is the first of a daily progress analysis. The
[daily engineering brief](https://duncan-haywood.github.io/oss-monorepo/dev/daily/)
already lists every merge from templates, with no judgment. This post adds
the judgment: what the numbers say about whether the work is going where it
should. The window is the 72 hours from 01:20 UTC on 21 October to 01:20 UTC
on 24 October. Every figure comes from `git log --first-parent` of `main` or
from the 820 run records in `prompts/runs/` dated 21 to 24 October.

## The short version

The fleet is fast and steady, and it put the most effort where the owner
said to. Three things hold it back. The top flagship is growing wider on
test files the agents wrote themselves, and real inputs are what it needs.
Research projects are appearing at about 72 a day, faster than anyone could
read them. And after all of it, not one visitor to any product has been
measured. The fleet can fix the first two. It cannot fix the third.

## Throughput

| | |
|---|---|
| Merges to `main` | 922 (325, 299 and 299 per UTC day; 355 on 20 October) |
| Merges per hour, last 24 hours | 9 to 26, around the clock |
| Reverts | 0 |
| Run records | 820: 724 success, 95 partial, 1 failed |
| Tests added (129 runs reported it) | 686 |
| Red-team runs | 68: 104 mutation campaigns, 20 real defects found |
| New research projects | 217 (825 to 1,042 folders under `research/`) |
| Blog posts / agent reports added | 44 / 34 |

Throughput has settled near 300 merges a day, down about 15% from 20
October, with no revert in three days. That is a healthy main branch, not a
sign of progress by itself. Only 261 of the 820 records report a cost. Those
261 runs cost $216 in API-equivalent terms, with a median of $0.74 and 4.8
minutes per run. With two thirds of runs not reporting, the total is
unknown, so I won't extrapolate one.

## Where the effort went

By the area each merge touched, ventures led with 528 merges, then research
with 270. One product got far more than the rest:

- **`ai-bookkeeper`, 278 merges (30% of the total).** It is flagship number one
  in `portfolio/flagships.yaml`, added on the owner's direction "I want to
  make ai accounting systems", so this is the intended allocation. Its
  merges per day rose from 72 to 88 to 108.
- **`wall-framing-takeoff`, 58 merges.** This is flagship two, the
  new-home-construction program. Gable walls, valley backing, a second
  cross wing, header tables and, today, foundation quantities, each first in
  the engine and then on the page. It is steady and it follows its roadmap.
  One slice measured a roadmap idea (reusing cut-outs from openings), found
  that zero panels fit, and retired it. That is the right way to drop an item.
- Then `hearth-and-horizon` (38, fiction), `changepoint-detector` (33),
  `einvoice-preflight` (25), `shift-roster-builder` (20).

## Concern 1: the bookkeeper is getting wider, on made-up inputs

The flagship's own `next` list puts real inputs first. Item 1 is the AI
layer on real bank descriptions. Item 2 is the bank readers on real exports
from Chase, Bank of America, Wells Fargo and others. Over these three days
the merges went the other way. The bookkeeper now reads Japanese, Korean,
Chinese, Indian, Spanish, Indonesian, Arabic, Swiss, Belgian, Nordic,
Italian, Polish, Czech, Hungarian and Turkish bank CSV headers. It also
reads BAI2, Norma 43, CFONB 120, Excel 5/95 and Shift_JIS and GBK files. The
flagship entry itself says each reader is "tested only on hand-built or
made-up files".

Every one of those readers is a guess at a format that nobody here has
seen in a real export. One fix PR (#9933, "fill gaps after #9932") shows
what that costs: guesses need second passes. Adding the fortieth header map
is easy for an agent and looks like progress in the merge count. Getting one
real statement through the books, end to end, would tell us more than all of
them. The way to get one is a statement the owner exports from an account
they hold, with names removed. Failing that, there are the sample files some
banks and standards bodies publish with their format specs.
**Recommendation: stop adding formats until one real file has gone through.**

## Concern 2: research is growing faster than anyone can read it

About 72 new research projects a day is a lot. Self-reported integrity
issues were rare: 3 of 820 records. One of them is a good catch. The first
version of `infra-pumpsched` simulated tariff windows that cross midnight
wrongly. A cross-check found the bug, and the results were fixed and
disclosed. Still, 65 research projects across the tree have no figure, and I
have not read the 217 new ones. Volume says nothing about quality either
way. The owner's "depth over calculators" direction was written about
products, but its logic applies here too. A second answer to one good
question is worth more than another new question.
**Recommendation: a run that audits a random 20 of this window's research
projects for a reproducible result and an honest limits section, and
publishes the hit rate.**

## Concern 3: still nobody measured

`portfolio/usage/usage.yaml` has 460 product entries, and every
`live_url_visitors` is `null`. The site feedback form has received no
messages. That does not mean usage is zero; it means usage is unmeasured.
The fleet cannot close this gap. The owner's decision queue holds 13 items,
and the oldest has waited 66 days. Among them are the egress policy that
gates measurement, the publication identity that gates distribution, and a
custom domain flagged for domain-takeover risk 44 days ago. 922 merges into
products whose use nobody can see is the weakest part of this picture.

## Smaller signals

- **Duplicated work.** At least 23 runs (3%) said in their notes that they
  built something another PR had just landed. One example is MACRS on the
  page, which landed minutes apart in two PRs. With some 16 sessions in
  parallel, 3% is tolerable. The search-before-you-start guidance is
  working well enough.
- **Where runs trip.** 475 of 820 records report friction with the
  documentation. `research/CLAUDE.md` (117 mentions) and
  `research/PROJECTS.md` (92) lead by a wide margin, ahead of
  `portfolio/flagships.yaml` (53) and the Python environment helper (47).
  The research guide is the one most worth a cleanup pass.
- **Red team is paying.** 20 real defects from 104 mutation campaigns, each
  fixed in its own PR, is the cheapest bug-finding in the repository.

## What would move things most

1. The owner: the egress and measurement decision, then the custom domain.
   Nothing else on this list changes what we can learn about users.
2. `ai-bookkeeper`: one real bank export through the whole pipeline.
3. Research: a quality audit of the new projects before many more are added.
4. Process: trim `research/CLAUDE.md` where runs report tripping.

The next post will check these against the following day's merges.

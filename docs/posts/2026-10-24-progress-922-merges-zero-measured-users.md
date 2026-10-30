---
title: "Progress, 21 to 24 October: 922 merges, 217 research projects, zero measured users"
seo_title: "Progress, 21 to 24 October"
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
on 24 October. Every figure comes from `git log --first-parent` of `main`,
from the 820 run records in `prompts/runs/` dated 21 to 24 October, or from
the GitHub Actions runs on `main` of the two workflows named below.

## The short version

The fleet is fast and steady, and it put the most effort where the owner
said to. Three things hold it back. The top flagship is growing wider on
test files the agents wrote themselves, and real inputs are what it needs.
Research projects are appearing at about 72 a day, faster than anyone could
read them. And after all of it, not one visitor to any product has been
measured. The fleet can fix the first two. Only the owner could fix the third,
and the counter went live minutes after the window closed.

On the standard DevOps measures, delivery is quick: half of all merges are
live within 15 minutes. It is not stable, though. One of the two main
validation workflows was red for a quarter of the window, and the site build
for a third. Each red site build is a deploy that did not happen.

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

## Delivery: the four DevOps metrics

The usual yardstick is the four DORA metrics: how often you deploy, how long
a change takes to go live, how often a change breaks something, and how fast
you recover. Here they are taken from the Actions runs on `main` of
`portfolio-pages.yml` ("Portfolio Pages": test, build, deploy, which puts
the catalogue live) and `portfolio-validate.yml` ("Portfolio validate":
schema, router and site checks). From the next edition the dashboard computes
these numbers itself, as `delivery` in
[`dev/stats.json`](https://duncan-haywood.github.io/oss-monorepo/dev/stats.json),
so no agent has to recount them.

| Metric | Value, 21 to 24 October |
|---|---|
| Deploys (successful Pages runs on `main`) | 294: 81, 119 and 90 per day |
| Merge to live (merge commit to the end of the first successful deploy started after it) | median 15 min, 75th percentile 31 min, 90th 124 min, worst 6.6 h; 169 of 921 merges took over an hour |
| Pages runs that failed, of those that finished | 176 of 470 (37%); 51%, 16% and 40% by day |
| Validate runs that failed, of those that finished | 137 of 552 (25%); 13%, 7% and 52% by day |
| Red spells on `main` (green to red and back) | Pages 19, validate 15 |
| Time to restore (red to the next green) | Pages median 0.6 h, 90th percentile 2.8 h; validate median 0.2 h, 90th 3.6 h |
| Hours `main` was red | Pages 23.5 of 72 (33%); validate 18.4 of 72 (26%) |

Deploy frequency and lead time are excellent by any standard. Most teams
measure lead time in days; here it is minutes, because an agent merges
its own PR and every merge builds the site. Stability is the weak half.
A Pages run that fails stops at "Test the site builder", "Build the site"
or "Check the built artifact", before the deploy job. So during the 33% of
the window the Pages build was red, nothing new went live; the site held
the last good build. That is why one merge in five waited over an hour
to go live.

Two things drive the red time. First, PRs merge over red checks.
"Portfolio validate" runs on pull requests too, but it is not a required
check. #9893, the merge that opened the four-hour red spell on 23 October
at 21:04 UTC, went in with `validate` failing on its own head commit (the
`VENTURE.yaml` schema check). #9958 merged with `validate` and `check`
failing on its head. Second, with about 13 merges an hour, one breaking
merge is soon buried under a dozen more before anyone fixes it. Recovery is
quick in the median but has a long tail: that spell lasted until 01:16 UTC,
and validate was red again when the window closed. The day's own fix titles
show the pattern: "pages: type .whl files (fixes build job red on every PR
since #9782)".

**Bug rate.** Counting bugs by title is a floor, but it is what the files
give. 29 of 921 merge titles say "fix" (3%), and one names a PR from the
same window it repairs. The red team is a better reading: it mutated code in
104 campaigns and found 20 real defects that the tests missed. That is a
measure of test gaps, not of bugs users hit. Escaped defects can't be
measured yet. No issue was opened in the window, and with no measured
visitors, silence says nothing. From the GitHub API, the dashboard
(`dev/stats.json`) adds that 80% of PR branches go green on the first try,
and CI passed 86.7% of the runs that finished in the last 14 days (116,815
runs).

**Recommendation: make a red `main` stop the line.** Make "Portfolio
validate" and the Pages build required checks in branch protection, which is
a repository setting only the owner can change. Until then, a run should not
merge over a red check that its own diff reaches. And the next run that sees
a red Pages build on `main` should fix it before merging anything else. A third of the
day without deploys costs more than any single feature adds.

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

**Update.** At 01:36 UTC on 24 October, sixteen minutes after the window
closed, #9963 pointed the site at the Cloudflare edge Worker that the owner
had just deployed. The feedback form and page-view counts are now live. The
next editions can report visitors per product instead of `null`, the first
real reading of whether anyone uses this work.

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

1. Measurement, now live: check that page-view counts reach
   `portfolio/usage/` and read the first numbers. The custom domain is still
   the owner's to decide.
2. Delivery: make a red `main` stop the line (the owner: required checks
   in branch protection; runs: no merging over a red check, fix a red Pages
   build first).
3. `ai-bookkeeper`: one real bank export through the whole pipeline.
4. Research: a quality audit of the new projects before many more are added.
5. Process: trim `research/CLAUDE.md` where runs report tripping.

The next post will check these against the following day's merges.

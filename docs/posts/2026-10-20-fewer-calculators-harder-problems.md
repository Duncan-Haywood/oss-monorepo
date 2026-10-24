---
title: "Fewer calculators, harder problems"
date: 2026-10-20
description: "The owner on why this repository's agents should stop shipping small calculators and put the effort into research and the projects with real depth."
tags: [opinion, ai-agents, product, research]
---

# Fewer calculators, harder problems

*An opinion piece from the owner of this repository.*

In my own words, the short version:

> "we are still shipping all sorts of stupid calculators. I think we can move
> more of that effort into cooler projects like the ones I've suggested for
> example. a lot to work on there. also dedicating effort to actual research
> and research adjacent things is better than all these stupid caluclators."

The rest of this post is the longer version.

## Where the effort went

This repository is built mostly by unattended AI coding sessions. Here is what
they have built, counted from `main` on 20 October 2026:

- **1,309 products** in `ventures/`.
- **647 of them are named `*-calculator`**, and 121 of those are
  `<trade>-bid-calculator`.
- **589 calculators have a `calc.mjs` engine. The average one is 258 lines**,
  and most of those lines are presets, input checks and labels. The attic
  insulation bid calculator is typical: a table of R-value per inch and price
  per bag, then area times depth, bags times price, plus hours times a rate.
- **24 open pull requests have "calculator" in the title.** Most add a
  comparison page to a calculator that already exists ("vs. a flat price per
  acre", "vs. a spreadsheet") or adopt a stranded branch that did.

We have already written about [how the fleet ended up with 121 bid
calculators](2026-10-16-how-our-agents-built-121-bid-calculators.md), and the
router now ranks template families down. The calculators keep coming anyway,
because they are the easiest thing in the repository to finish. A session can
start one, test it, give it a page and merge it in an hour. That is exactly
why it is the wrong default.

## Why it's the wrong default

A calculator whose maths fits on an index card is not a product. Anyone with
a chatbot gets the same answer by typing the question. It doesn't compound:
the 648th calculator doesn't make the first 647 better, and nothing in it
teaches the next session anything. And a page per trade, then a comparison
page per calculator, starts to look like content made for search engines
rather than for people.

Meanwhile the work that is hard and worth doing is sitting there:

- **Research.** `research/` has 765 project folders across
  [28 topics](../../research/):
  self-replicating manufacturing, open-source robots, LLM and algorithmic
  chip-design loops, task-specific AI accelerators, simulation-first
  mechanical design, engineered clothing, open-source house construction,
  robot societies, machine learning on qualitative data. Most of those topics
  have far more open questions than finished answers. Each new result there
  is something nobody else has.
- **Research-adjacent work.** Open tools, datasets, replications and
  write-ups that come out of the research: the things another researcher or
  engineer can pick up and build on.
- **The flagships.** [`portfolio/flagships.yaml`](../../portfolio/flagships.yaml)
  lists the products with real depth, each with a hard next step: an EN 16931
  e-invoice validator running the official Schematron rules, a shift
  scheduler that has to *prove* its roster is the cheapest one, a photo
  pipeline that grades real footage. One milestone on any of those is worth
  more than a week of calculators.

## What I want instead

1. **Default to depth.** A run with a free choice picks research, a
   research-adjacent tool, or the next step on a flagship before it picks a
   new small product.
2. **A new calculator has to earn its place.** It needs an engine that is
   actually hard: the companion post,
   [If it's a calculator, make the maths hard](2026-10-20-if-its-a-calculator-make-it-hard.md),
   says where that bar sits.
3. **Stop dressing up the easy ones.** Another comparison page on a
   bid calculator is not progress. Consolidate the families or leave them
   alone.

None of this means the existing calculators get deleted. Usage here is
unmeasured, not zero, and some of them may turn out to help people. It means
the next hour of work goes somewhere it can matter more.

**Update, 2026-10-21.** The owner went one step further: "i want to drop the
recommendations that have us still working on stupid calculators." So points
2 and 3 above are now simpler. No new calculators, no consolidating the
families, no comparison pages: the 657 calculators on `main` stay live and get
fixed when they break, and that is all. The work router now lists every one of
them last, with a "Maintain only" task, under the seven flagships and every
other product. A tool built on a published method that is genuinely hard to
reproduce still counts, but as a research tool, not a calculator.

The owner then said what the rule is about: "if it's already built there's no
damage in merging them and adding them. it's the resource allocation that's
the problem." So a calculator PR that is already written can still land. What
stops is starting new ones and spending runs deepening them. Three days in,
it is holding: of 440 commits on `main` from the router change (21 October)
to 24 October, one touched a calculator, and that was a red-team test run.
Most venture commits went to ai-bookkeeper (143), wall-framing-takeoff (29)
and the flagships.

*Drafted by an AI agent (Claude Code) from the owner's own words; the quotes
are verbatim, and every count comes from the repository's `main` branch on
2026-10-20. Everything linked is MIT-licensed and public.*

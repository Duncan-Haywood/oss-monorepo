---
title: "If it's a calculator, make the maths hard"
date: 2026-10-20
description: "The owner's bar for any new calculator here: an engine a maths graduate can't follow at a glance and a chatbot can't replace in one line."
tags: [opinion, ai-agents, product, algorithms]
---

# If it's a calculator, make the maths hard

*An opinion piece from the owner of this repository. Its companion is
[Fewer calculators, harder problems](2026-10-20-fewer-calculators-harder-problems.md).*

Some problems really do want a calculator. When one does, this is the bar, in
my words:

> "if you are making a calculator at least have the underlying engine be
> something sophisticated enough and that chatgpt can't ignore it and just do
> it for someone on in a single line of code so to speak. like if you are
> making calculators make calculators that take some effort and are actually
> hard to replicate. something inaccessible algorithms from research papers
> and whatnot."

And more bluntly:

> "like if you're doing a calculator I better not be able to understand the
> math behind it at a glance with my ba in mathematics. yk? something
> actually difficult not waste paper."

## The two tests

**The chatbot test.** Describe the calculator to a general-purpose chatbot.
If it can produce the same number in one reply, or one line of code, the
calculator adds nothing. Most of this repository's 647 `*-calculator`
products fail it: their engines are rates times quantities plus a margin.

**The maths-degree test.** Show the engine to someone with an undergraduate
maths degree. If they understand all of it at a glance, it is too easy to be
worth a product of its own. It should need a paper, a solver or a proof to
follow.

## What passes

Two products already in the repository show the kind of engine I mean.

- **[customer-lifetime-value-predictor](../../ventures/customer-lifetime-value-predictor/README.md)**
  fits the BG/NBD model (Fader, Hardie and Lee, 2005) by maximum likelihood
  and the Gamma-Gamma spend model (Fader and Hardie, 2013) to a shop's own
  order export, then reports the chance each customer is still active. A
  chatbot can name those models; it can't fit them to a shop's whole order
  history in a reply.
- **[shift-roster-builder](../../ventures/shift-roster-builder/README.md)**
  searches rosters with simulated annealing, then runs a branch-and-bound
  search with a min-cost-flow lower bound to prove how close to the cheapest
  roster it got, and says when it can't prove it.

The pattern: a published method that is hard to implement correctly, applied
to the user's own data, with an honest statement of how good the answer is.

## Where to look for engines like that

- **Statistics and forecasting:** hierarchical and survival models,
  probabilistic forecasting with calibrated intervals, change-point detection,
  causal-impact estimates.
- **Optimisation:** integer programming, constraint solvers, vehicle routing,
  cutting and packing, scheduling with proofs of optimality or bounds.
- **Physics and engineering:** finite-element checks, thermal and structural
  simulation, control design, the kind of models this repository's
  [research tracks](../../research/)
  already build.
- **Mechanism design and scoring:** proper scoring rules, auctions, market
  makers, again with research in this repository behind them.

The best source is our own research. A result that took a research track
weeks to reach, wrapped in a tool a practitioner can use, is a product nobody
can copy in an afternoon.

The first tools built this way are already out: changepoint detection,
conformal prediction intervals and matrix profiles, each on the visitor's own
data with the paper cited
([Research algorithms in your browser](2026-10-20-research-algorithms-in-your-browser.md)).

## What this means for a run

Before building a calculator, write down the engine in one sentence. If the
sentence is arithmetic, don't build it: deepen a flagship or a research
project instead. If the sentence names a model, a solver or a paper, build
it, cite the paper in the README, test it against a published example or a
brute-force check, and say on the page what the answer's limits are.

The numbers these tools give are estimates from their inputs and stated
assumptions, not financial, legal or professional advice.

*Drafted by an AI agent (Claude Code) from the owner's own words; the quotes
are verbatim, and the product details come from each product's committed
README. Everything linked is MIT-licensed and public.*

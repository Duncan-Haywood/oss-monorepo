---
title: "The constant that was not constant: why our team ranking read disagreement at a third of its size"
seo_title: "PQL vs Laplace: fixing a low Bradley-Terry random-effects spread"
date: 2026-11-14
description: "Our team ranking read disagreement at 30-60% of its true size. One dropped term made a Laplace fit into PQL. Kept, a true 2 reads 2.0-2.3."
tags: [quick-pick-survey, pairwise-comparison, bradley-terry, random-effects, statistics, product]
---

The free [list ranker](https://marisstella.app/quick-pick-survey/rank.html)
combines a team's pairwise picks into one order, with two 90% rank ranges:
one for *this group*, one for *people like this group*. The second depends on
one number, tau: how far each person's likes sit from the group's. Earlier
today we shipped it with a known flaw. Simulated people who truly differed by
2 logits were read as differing by 0.6 to 0.9. We put that down to "the usual
Laplace bias with binary answers" and showed tau only in words.

It was not the usual bias. It was a dropped term.

## What was dropped

Each person's Bradley-Terry likelihood is replaced by a quadratic around a
point c: a curvature J, a linear term h, and a constant k. The marginal
likelihood that picks tau is then a Gaussian integral, and the code's comment
said k was "a constant that does not depend on tau", so it was left out.

But c is each person's best-fitting scores *given the group and tau*. Change
tau and c moves, and k = l(c) - grad'c - c'Jc/2 moves with it. Leaving k out
is not the Laplace approximation. It is penalised quasi-likelihood (PQL), and
PQL's downward bias on variance components with yes/no answers is a
textbook result (Breslow and Clayton 1993; Rodriguez and Goldman 1995).

## The measurement

Same simulation, same seeds: 8 or 15 options, 3 to 10 people, true tau 0, 1
or 2, each person answering the page's own adaptive questions, 40 teams per
cell (every cell is in `docs/team-ranges-laplace-2026-11-14.jsonl` in the
venture).

- True tau 2: read 0.61-0.85 before, **1.99-2.27 now**.
- True tau 1: read 0.36-0.49 before, **0.97-1.20 now**.
- True tau 0: read 0.06-0.17 before, 0.15-0.34 now. A spread cannot go below
  zero, and a few noisy answers look like disagreement, so this one reads
  slightly high.

The "people like you" range now covers the truth 95.5-100% of the time in
every cell, against 90-100% before. At 15 options and 3 people who disagree
strongly it is 10.9 places wide, up from 9.0. That is the honest answer:
three people who disagree tell you very little about a fourth. The old range
only just held its 90% claim there (90.3%).

The fix also made the "everyone agrees" read (tau = 0) and the fitted reads
comparable at all. They expand around different points, so without k their
likelihoods differed by unrelated constants.

## What changed on the page

Nothing you have to learn. The table's "Wider" column is a little wider
where people disagree, and the sentence about how alike the team's likes are
now uses thresholds set for an unbiased tau. A test pins the fix: 10
simulated people at tau 2 must read between 1.4 and 3. The old code reads
0.57-0.84 and fails it.

## The lesson we are keeping

"Up to a constant" is a claim, and it needs the same check as any other.
Here the check was cheap: write the quadratic's value at its own expansion
point and compare it with the log likelihood there. If the two differ by
something that depends on what you are fitting, it is not a constant.

The method and both tables are in the venture's `docs/RANK-PAGE.md`, "Team
ranges". The ranker is free, runs in your browser, and sends no answers to us.
Estimates only, from the answers given.

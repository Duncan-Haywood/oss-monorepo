---
title: "How sure is a league table? Re-ranking the 2023-24 Premier League from its results"
seo_title: "Free Bradley-Terry ranking tool: ratings, rank ranges, home advantage"
date: 2026-11-18
tags: [pairwise-ranking, bradley-terry, sports-analytics, paired-comparison, research-algorithms, browser]
description: "A free Bradley-Terry tool fits all 380 results of 2023-24: City were likeliest the best side, but only 59% likely, and 13 clubs span 8+ places."
---

Manchester City won the 2023-24 Premier League by two points. Were they the
best side, or the side that finished first? A points table can't say. It
counts results and doesn't ask how sure the order is.

The new [pairwise ranking tool](../../ventures/pairwise-ranking/) answers
that from head-to-head results. Paste one game per row (`winner,loser`, a
result column, or home and away scores) and it fits the Bradley-Terry model
to every game at once. Each player gets a rating with a standard error, a
rank range, and a chance of being the strongest. Draws are handled by
Davidson's (1970) tie model and home advantage gets its own term with a
test. It runs in the browser, and the same engine works from the command
line and as an agent call.

## What the 380 results say

The season's results come from the public-domain
[openfootball](https://github.com/openfootball/football.json) data, and they
are the tool's first example. These are the numbers it prints (seeded, so
they reproduce):

- **City were most likely the best side, at 59%, not 100%.** City came top
  in 59% of 4,000 simulations drawn from the fit's uncertainty. Arsenal came
  top in 32% and Liverpool in 9%. The chance that City were really stronger
  than Arsenal is 64%. Thirty-eight games each is not much evidence for a
  two-point gap.
- **The middle of the table is mostly noise.** Of the 20 clubs, 13 have a
  95% rank range eight or more places wide. Chelsea could be anywhere from
  3rd to 12th. Manchester United and Newcastle, level on 60 points, are 4th
  to 14th. Only the bottom three are clearly bottom-three.
- **Home advantage is real and large.** Playing at home multiplies a side's
  strength by 1.66 (95% interval 1.25 to 2.19), worth 88 points on Elo's
  scale. The likelihood-ratio test gives p = 0.0003. Between two equal sides
  the home team wins 46%, draws 26% and loses 28%.
- **Draws:** Davidson's ν is 0.73, so two equal sides on neutral ground draw
  27% of the time, and the share falls as the gap between them grows. For a
  neutral City v Arsenal the model gives 41% City, 27% draw, 32% Arsenal.

The order itself matches the points table, and that is expected. Every club
played every other twice, home and away. In a balanced schedule like that
the likelihood equations make each side's expected score equal its actual
score, so the fitted order follows wins plus half-draws. This season that is
also the points order. What the model adds is the uncertainty, the home
effect and the draw rate. On an unbalanced schedule (a Swiss chess event,
half a season, a taste test where not every pair was tried) it also corrects
the order for strength of schedule.

## When there is no answer

Bradley-Terry has a well-known trap. If one group of players never lost to
anyone outside the group, the best fit makes them infinitely strong, so no
ranking exists (Ford 1957). The tool checks this with strongly connected
components of the who-beat-whom graph. When the check fails it names the
unbeaten group and shows a penalised fit, clearly labelled.

Building the reference turned up a second trap. With a draw term or a home
term, Ford's condition is no longer enough. A random tournament passed the
graph check, but its home sides had won every game they could. The
likelihood kept rising as the home advantage went to infinity, and the
reference optimiser and the engine stopped at different points on that
ridge (log-likelihoods equal to nine decimals, strengths 2.3 apart).
Two players with one win and one draw between them do the same thing under
Davidson's model. So the engine now also watches for a parameter running
off towards infinity. When one does, it says so and refits with a prior on
every parameter.

## How it was checked

The engine fits the model by Newton's method. The model is written as a
softmax of utilities that are linear in the parameters, so the likelihood
is concave and five or six iterations suffice. Python made 30 independent
fits for comparison. Models without a draw term used statsmodels' binomial
GLM, the textbook route. Models with one used scipy's BFGS on Davidson's
likelihood, written out directly. The engine reproduces every strength to
1e-7 (GLM) or 2e-5 (BFGS), and every standard error to 1e-6 or 0.1%. Hunter's
(2004) MM algorithm, a different method, agrees with Newton to 1e-9.

## Limits

The model gives each club one strength for the whole season: no form,
injuries or January signings. The intervals use a normal approximation,
which is rough for players with only a handful of games. And this is
statistics on past results, not betting advice.

Next steps, if people use it: strengths that drift over time (a state-space
Bradley-Terry), covariates such as player ratings or price, and quasi-standard
errors (Firth & de Menezes 2004) so any two players can be compared at a
glance.

*Produced with AI assistance. Not affiliated with the Premier League, any
club, or the authors of the cited papers.*

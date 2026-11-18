---
title: "Our survey ranking looked overconfident on long lists. The test harness was the problem"
seo_title: "A 14% false-confidence rate that was a one-line simulator bug"
date: 2026-11-13
description: "A simulation said one in ten clear calls on 150-item surveys were backwards. The ranking was fine: a cap in the harness counted unanswered items as votes."
tags: [quick-pick-survey, surveys, ranking, statistics, simulation, debugging, meta-analysis]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by
asking each person to choose between two items at a time, then pools
everyone's answers into one ranking. Each item gets a 95% interval and a
range of ranks it could hold. When two items' intervals don't overlap, the
report says one is clearly above the other.

Earlier today a simulation run on 150-item lists found a problem. With
half to one answer per item per person, 5.4% to 14.3% of the "clearly
above" calls were backwards, and that was with every simulated respondent
answering honestly. On 15- and 30-item lists the rate was 0.5%. A ranking
that gets one call in ten backwards isn't being honest about its
uncertainty, so this run went looking for the cause.

## Two suspects, and the one we didn't name

The earlier run named two suspects. The first was the rating scale: each
person's ratings come from an online Glicko-2 update, and after one or two
answers per item they might not sit on a common scale. The second was thin
data: the random-effects pool (DerSimonian-Laird) estimates how much
people disagree about each item, and on a long list some items have only
one or two raters.

We wrote a separate simulation that scores five pooling methods on the
same simulated answers. It covers both question orders, panels of 20 and
60 people, and 10 surveys per cell. Every respondent is honest, so every
wrong call belongs to the estimator. With the shipped pool, 0% to 0.4% of
clear calls were backwards. We couldn't reproduce the problem.

The difference turned out to be one line in the old harness:

    rows.push({ ...r, rd: Math.min(r.rd * scale, 349) })

Some of the harness's schemes give careless people less weight by scaling
up their rating deviation (rd). The cap at 349 kept a scaled row from
passing 350. That matters because the ranking treats rd 350 as "never
answered" and drops the row. But every item a person never saw also sits
at rating 1500 and rd exactly 350, and the cap pulled those rows down to
349 too. On a short list everyone answers about every item, so nothing
changed. On a sparse 150-item list, most of each person's rows are items
they never saw. Each item picked up a dozen or more phantom raters, all
voting for the middle, and its interval narrowed around a value pulled
toward 1500.

Putting the cap back into the new simulation reproduces the original
result: 5.2% to 14.5% backwards, against the 5.4% to 14.3% first reported.
The production ranking reads only stored per-person ratings, and those
exist only after a person answers about the item, so it never had this
fault.

## What the suspects actually cost

- **Thin items:** nothing. Refusing to call any pair clear when either
  item has fewer than three raters changed no result, because every clear
  pair already involved items with six or more raters.
- **The rating scale:** a little. Pooling each person's full
  Bradley-Terry refit instead of their online ratings cut the worst cell
  from 0.39% to 0.11% backwards. It also made 0.6% to 10% fewer clear
  calls.
- **A single joint fit of everyone's answers** made no wrong calls, but it
  made 20% to 54% fewer clear calls, and its cost grows with the cube of
  the list length on every report request. The shipped pool's error rate
  is already about one in a thousand, so the joint fit isn't worth it.

## The re-run

We re-ran all 48 long-list cells from the morning with the harness fixed.
With no careless respondents, 0.00% to 0.35% of clear calls were
backwards; with a quarter or 40% of people answering at random, 0.00% to
0.16%. One case is still confidently wrong: people who all pick by the same
irrelevant trait, such as the more familiar name. At 40% of the panel
that gives 3% to 8% backwards, which matches what short lists already
showed and what the report's agreement note exists to flag. The rank
correlations behind the morning's question-order decision moved by at
most 0.0005, so that decision stands.

The cap had a second effect: it stopped any weight below about 0.7 from
taking effect. So the agreement-weighting schemes measured over the past
week were weaker than described. Run uncapped, they help more against
shared-trait clickers, and they also take about twice as much from a
genuine minority taste (-0.03 to -0.06 rank correlation, up from -0.02 to
-0.03). Both decisions that rested on those numbers still hold, and the
case for them is stronger: agreement is reported to the owner and not
used as a weight, and the self-consistency gate stays unshipped.

## What changed

- Both sweep scripts now drop never-answered rows themselves and pass
  weighted rows through uncapped.
- `groupRanking` takes `{ answeredOnly: true }` so a down-weighted row
  above rd 350 still counts. A unit test fails on the old filter.
- The earlier claim in the docs is marked withdrawn and points to the new
  section, with raw rows for every cell.

The ranking that owners see didn't change. What changed is that the
documentation now says something true about it.

*Simulated respondents (Bradley-Terry choices, uniform true values,
person-to-person spread 0.25). No real panel here has more than 15 items,
so long lists are still untested on real people.*

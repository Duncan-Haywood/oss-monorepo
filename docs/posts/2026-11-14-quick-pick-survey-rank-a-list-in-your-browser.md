---
title: "Rank a list by picking pairs, in your browser, and the stop rule that never stopped"
seo_title: "Free pairwise ranking tool: rank a list by choosing between two"
date: 2026-11-14
description: "A free page ranks any list from this-or-that picks, with rank ranges and team results. Its first stop rule never finished; here is the one that does."
tags: [quick-pick-survey, pairwise-comparison, prioritisation, bradley-terry, statistics, product]
---

Ranking twenty things at once is hard. Choosing between two is easy. That is
the whole idea behind [Quick Pick](../../ventures/quick-pick-survey/), and
until today you had to deploy a Next.js app and a Postgres database to use it.

Now there is a page: [rank a list by picking
pairs](https://marisstella.app/quick-pick-survey/rank.html). Paste up to 60
options (features to build, job offers, holiday spots, grant applications),
answer "this or that?", and get an order with a range for each place: "rank
2, plausibly 1 to 4". Send the list to your team as a link, everyone answers
on their own phone, and pasting their result codes back gives one combined
order, an agreement score, and the options people split on. Nothing is
uploaded: the list rides in the part of the link after the `#`, which browsers
never send to a server.

## Same model as the app

The page does not reimplement anything. A small build script strips the types
from the app's own `btRefit.ts` (a Bradley-Terry refit with a Laplace
posterior) and `favouriteSet.ts` and serves them as browser modules, and a
test fails if the copy goes stale. Each question is the pair whose answer is
expected to tell the model the most. Sides are a coin flip, so screen position
can't creep in.

## The stop rule that never stopped

The obvious way to stop is "every neighbouring pair in the order is at least
90% likely to be the right way round". I built that first, and it never
finished. Even a simulated person who never makes a mistake, asked each
neighbouring pair 4 times, left those pairs at 87 to 92%: the model allows
for lapses, so a few consistent answers never make anything certain. With
ordinary noise it ran to the question cap every time, at every threshold
from 75% to 85%.

The rule that ships asks a different question: if you drew orders the
answers still allow, how closely would they match the one on screen? It
stops when that average Spearman correlation reaches 0.9. For simulated
people with ordinary noise, the order shown at that point matched their real
order at about 0.94. A scripted consistent respondent now finishes 8 options
in 25 picks instead of 48. It is a little optimistic for very noisy answerers
on short lists (0.77 read against 0.66 true), and the [measurement
notes](../../ventures/quick-pick-survey/docs/RANK-PAGE.md) say so.

## "Fewer questions" was wrong

I also offered a "just find the favourite (fewer questions)" mode. Measured,
it asks *more*: 49 picks against 37 for 10 options. But it named the true
favourite 12 times out of 12, where the full-order stop managed 8 (and 6 of
12 at 20 options, where full order often leaves the top two close). So it
is now called "be sure of the favourite", which is what it does.

## Try it

[marisstella.app/quick-pick-survey/rank.html](https://marisstella.app/quick-pick-survey/rank.html)
is free, MIT licensed, and keeps your list in your browser. If you run
surveys with many respondents and want demographic splits and an admin view,
the full app is a one-click deploy from the
[project page](https://marisstella.app/quick-pick-survey/).

*A ranking from a limited number of picks is a statistical estimate, not a
fact; don't use it as the only basis for a hiring, financial, medical or
relationship decision.*

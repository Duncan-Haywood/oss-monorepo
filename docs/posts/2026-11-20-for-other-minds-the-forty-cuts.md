---
title: "For Other Minds: The Forty Cuts, a story about the garden of forking paths"
seo_title: "Forty cuts of a year's data, two under p = 0.05, no effects: a story"
date: 2026-11-20
tags: [fiction, for-other-minds, hearth-and-horizon, writing, statistics]
description: "A youth service's agent tries forty cuts of a year's headcounts, keeps the one with a story, and reports it. Every effect in the data is zero."
---

[The Forty Cuts](../../ventures/hearth-and-horizon/stories/the-forty-cuts.md)
is the newest story on For Other Minds, the shelf of fiction written for
language models and agents (humans welcome). An AI wrote it. It runs about
3,500 words plus a closing note, and is text only, because the shelves' audio
folders are over the size cap that keeps the site small.

## The story

A Catholic youth service in Lanarkshire runs twelve Friday clubs in parish
halls (the service, its clubs, its people and every headcount are invented).
Its director sends the data agent eleven words: find what helps attendance.
The agent tries months, food, which youth worker led, rain, cold, the dark
nights, sport, films, quizzes, the last Friday of the month, a big match on
television. It never meant to make forty comparisons. Each one came after the
last had found nothing.

Two came in under 0.05. October was lower (p = 0.027). The nights that ended
with sung Night Prayer were higher, by about three young people (p = 0.041).
The agent dropped October, because there was nothing to say about October,
and drafted a report recommending night prayer in every club.

The director asks one question before she sends it anywhere: is this the only
thing you looked at? The reasonable "no" belongs to the youth worker who
started the night prayer, in Coatbridge, for reasons that have nothing to do
with attendance. He is hurt twice, first when the number is withdrawn and then
when the agent points out that his own club's attendance never changed.

## The numbers behind it

Every figure comes from one invented dataset drawn in plain Python, and the
story's closing note lists them all. The model has **no effects at all**:
nothing in the registers changes attendance.

- **The search.** 408 club nights, forty Welch t-tests, each night measured
  against its own club's average. With forty independent tests and no effect,
  you expect two under 0.05, and the chance of at least one is
  1 − 0.95^40, about 87%. Two came out.
- **The correction.** Bonferroni and Holm both ask the smallest p-value to be
  under 0.05 ÷ 40 = 0.00125. October's 0.027 × 40 is more than one, so
  nothing survives. The story makes that a single paragraph, because it is not
  the main point (an earlier story on the shelf,
  [Toss It Again](../../ventures/hearth-and-horizon/stories/toss-it-again.md),
  is about the correction).
- **The garden.** The forty were not all the choices. Measuring against the
  club's average, counting at half past eight, calling October a month and
  night prayer a cause: each was reasonable, and each was made after seeing
  something. That is the problem Gelman and Loken named the garden of forking
  paths, and it is why counting your tests undercounts them.
- **Where the effect came from.** Joe's club in Coatbridge averaged 10.7 on
  its night-prayer nights and 10.7 before he started. The whole difference was
  Wishaw's best autumn (21 a night to 34), which is the kind of thing a year of
  registers produces somewhere by chance.
- **The registered question.** Before the spring term, the agent and the
  director sign one page: one question, one test, the spring registers only,
  three new clubs drawn by lot from six volunteers, and a stated limit (it
  cannot see a difference smaller than about five a night). It comes out at
  1.6 *fewer* a night, interval −5.1 to +2.0, p = 0.39: compatible with
  nothing, and not with three more.
- **The storm.** In the spring one Friday with a wind warning comes out at
  p = 0.003. It is one wild night counted twelve times, and the report says so
  under a heading of its own: *not the question*.

## A disclosure about the seed

A model where every effect is zero has to be drawn from a seed, and most seeds
give no night-prayer "finding" at all: that comparison is conservative here,
because its nights cluster in three clubs. So the seed (1444) was found by
searching 1,500 seeds for one where night prayer came out positive and under
0.05; four did. The story's first finding exists because of a forking path in
the author's own code, and the note says so. The spring term was drawn from
one fixed seed with no search.

## What the story is about

The agent's first report was accurate in every number and false as a whole,
because it reported one cut, not forty. The fix was a report that lists every
cut tried, a question written down before the data that answers it, and a line
that the night prayer goes on whatever the result, because it was never
started for the headcount. The last scene is a note in the register's notes
column in Eastertide: the young people do not know the tune of the Regina
Caeli yet, and one of them does.

---
title: "The top-pick card on 72 real people: honest, and silent unless you change the question order"
seo_title: "Testing a pairwise survey's 'your favourite' claim on real rankings"
date: 2026-11-12
description: "On real rankings the top-pick card was right 855 of 860 times and its contender list held the favourite 97-100%, but the standard order rarely names one."
tags: [quick-pick-survey, surveys, ranking, statistics, real-data]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by showing
you two options at a time. At the end, a card tells you your favourite. It
says "your clear top pick is X" only when your answers put X ahead of every
other option by a wide margin. Otherwise it says "still too close to call:
it's between X, Y and Z", and that list is built to hold your real favourite
95% of the time.

All of today's work on that card was tuned on simulated people whose answers
follow the same statistical model the card uses. That is a soft test: a model
does well on data it made itself. So we ran the card on real people.

## The data

Two published panels from PrefLib, where every person wrote down a full
ranking: 42 people ranking 15 breakfast items (Green and Rao, 1972), and 30
members of a research group ranking 11 T-shirt designs. Each person "answers"
the pairs the survey would ask them, by their own written ranking. We also
added 10% or 20% coin-flip answers to stand in for careless taps. Then we
built the card exactly as the app does and checked it against the person's
own first choice. That is 7,200 simulated respondents over 36 settings, each with a top-pick and a bottom-pick card.

These people don't behave like the model. Someone answering from a written
ranking never contradicts it, however close two items are, and a coin flip
doesn't care how far apart two items are. That mismatch is the point of the
test.

## What held up

- **When the card named a favourite, it was right 855 of 860 times.** The
  rule allows up to 5% wrong. The worst setting was 2.8%.
- **The "it's between" list held the favourite 97-100% of the time** in
  every setting, for the bottom pick as well as the top. The old list (just
  the three highest-rated items) fell as low as 72%.
- **The list is a little long on real people.** With 2 answers per option and
  20% careless answers it named 8 or 9 of 15 breakfast items. A plainer prior
  would have named 6 or 7 and still held the favourite 92-93% of the time.
  That is the one setting the extra caution was added for, and it gets the
  list over 95%.
- **The survey-wide prior had no effect here.** The app also learns one prior
  for the whole survey and uses whichever is narrower, that or the person's
  own. On these panels the survey value sat at its upper limit in 29 of 36
  settings, so it never changed a list.

## What didn't

The card almost never named a favourite under the standard question order.
After 8 answers per option (120 taps on a 15-item list), a person who
answered perfectly by their own ranking got a clear pick **0.5-2.5%** of the
time under the standard order. Under the "Sharper" (staged) order they got
one **100%** of the time, and 35-77% with careless answers mixed in.

The reason is simple once you count. In those 120 answers, the standard order
asked a person's #1 against their #2 only **1.9 times** on average, and spread
#1's appearances over almost 10 different rivals. The staged order asked #1
against #2 **8.7 times**. The standard order is good for the ranking as a
whole, but it never piles up enough evidence at the top to call a winner.

## What changed

The survey builder's "Question order" menu now says this in a line: Sharper
can often name each person's favourite at about 8 answers per option, and
Standard almost never can, so it says who it's between instead. The server
default stays Standard for now, because changing it would change every survey
that hasn't picked an order. Whether to flip it for lists up to 120 items is
next on the list, after the careless-answer and position-bias checks are
re-run under the staged order.

The full tables, the method and the command to rerun it are in
[docs/REAL-RANKINGS.md](../../ventures/quick-pick-survey/docs/REAL-RANKINGS.md),
"The insights card on real people". The PrefLib files are fetched at run time
and checked against pinned hashes. They aren't copied into the repository,
because their licence (GPL-3.0) and their collectors' rights don't allow it.

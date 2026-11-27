---
title: "Is MaxDiff quicker than pairwise? Fewer taps, but the stopwatch decides"
seo_title: "MaxDiff vs pairwise comparison: which takes less time?"
date: 2026-11-15
description: "Best-worst screens of four took fewer taps than pairs in 11 of 12 simulations. Taps are not seconds, so the ranker now times real answers for a team."
tags: [quick-pick-survey, maxdiff, best-worst-scaling, pairwise-comparison, ranking, product]
---

> **Update, 2026-11-27:** the offer to deploy your own copy of the survey app was withdrawn, and no hosted version is live yet. The list ranker and decision page still work.

Earlier today [Quick Pick's list ranker](https://marisstella.app/quick-pick-survey/rank.html)
gained a [best and worst of four](https://marisstella.app/quick-pick-survey/maxdiff-best-worst.html)
mode: each screen shows four options, and you tap the one you like most,
then the one you like least. It's the MaxDiff question that survey platforms
sell as a paid add-on. In simulation it settled an order in fewer taps than
plain pairs in 11 of 12 cases. At 15 options, an ordinary answerer needed 27
screens (54 taps) against 70 picks.

That result counts taps, and a tap on a screen of four costs more than a tap
on a pair. You read four options instead of two and make two choices. So the
real question is how long a screen takes compared with a pick.

## The break-even ratio

A typical simulated person needs about 40 picks or 13 screens to settle 8
options, 73 or 27 for 15, and 146 or 65 for 30. So one screen replaces
roughly 3.1, 2.7 or 2.2 picks. Screens save time if one screen takes less
time than that many picks. If a screen takes 2.5 times as long as a pick,
screens still win on a short list but lose on a long one.

A simulation can't produce that ratio, because it depends on how people
read. So we measure it on real people.

## What the page records now

- **Each answer's time**, from when the pair or screen appears to the answer
  (for a screen, the second tap), in tenths of a second. If the page was
  hidden at any point during a question (another tab, a locked phone), that
  answer gets no time, not a wrong one. Undo removes the time along with the
  answer.
- **Your own pace** on the results screen: your median seconds per pick and
  per screen.
- **Times in the result code**, unless you untick "include how long each
  answer took". Nothing goes to a server. The code is text you send to
  whoever combines the team's answers.
- **The team's answer** when the codes include both kinds. The combine
  takes each person's median, then the median across people (so one slow
  person with many answers can't set it). It reports the screen-to-pick
  ratio and the time to a settled order with each kind: real seconds times
  the simulated number of answers to the stop. It labels which part comes
  from simulation and which part is your team's own data.

Before shipping we drove it with a scripted browser: one session answered
pairs at about 0.4 s per pick (its code pasted twice, as two people), another
answered screens at about 1 s per screen.
The combine read: *"A screen took 2.5 times as long as a pick ... about 16 s
with picks against 13 s with screens."* Real people will be slower and
noisier. That run only shows the arithmetic and the wiring work.

## Why bother

The best-worst landing page currently says screens need fewer taps, which
is what we measured. It doesn't say screens are quicker, because we haven't
measured time. Once a few real teams have combined timed codes, the ratio
will tell us whether that claim can be made, and for which list lengths.
The same times will also give the first real-world check of the answer-time
model that the self-hosted survey app's careless-answer tools rely on.

How it works, the code format and the tests are in
[docs/RANK-PAGE.md, "Answer times"](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/quick-pick-survey/docs/RANK-PAGE.md).
The ranker is free and MIT-licensed, and runs entirely in your browser.

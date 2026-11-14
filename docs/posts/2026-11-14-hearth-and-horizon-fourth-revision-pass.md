---
title: "Eleven lines for seven passes: 22 slips in 8 new stories"
seo_title: "Fact-checking AI-written science fiction: a fourth revision pass"
date: 2026-11-14
description: "A fourth pass re-checked the 8 newest Hearth & Horizon stories in Python. All 8 had slips, 22 in total. The physics held; the scenes' own counts did not."
tags: [hearth-and-horizon, fiction, editing, arithmetic]
---

[Hearth & Horizon](/ventures/hearth-and-horizon/) is the portfolio's shelf of
hopeful, hard-ish science fiction. Each story ends with a note that sets out
the model behind its numbers, so a curious reader can check them. Three
earlier editor's passes
([10 November](/posts/2026-11-10-hearth-and-horizon-revision-pass/),
[13 November](/posts/2026-11-13-hearth-and-horizon-second-revision-pass/),
[and again](/posts/2026-11-13-hearth-and-horizon-third-revision-pass/))
found the same pattern each time: the models were right, and the text around
them drifted. This fourth pass took the eight stories that no pass had read
yet, the newest on the shelf, 4,700 to 6,500 words each. Every number, date,
weekday, Easter and birth year was re-derived in a few lines of Python.

## The physics held, again

No model needed changing. The pass rebuilt each one from its note and got
the story's figures back. They were: Benford's law run on a parish ledger
(with a simulation of how often an honest 300-line ledger fails the test),
the Theis equation for how far a new irrigation well draws down a village
well a kilometre away, the creep of medieval window glass, where a deep-sea
cable broke, worked out from measurements at both ends, the impact odds of an asteroid
as its orbit firms up, a melt probe working its way through the ice shell of
Europa, and a space station's re-entry window shrinking pass by pass.

## What slipped: 22 fixes, and none of the eight was clean

That is 2.75 a story, the highest rate of the four passes. The kinds of slip
were mostly familiar: arithmetic in dialogue, a summary or note that
disagrees with the scene, a "three weeks before Easter" that is two. Two kinds
were new, and they are worth a writer's minute.

**Counting what the scene shows.** In *The Sky Is the Same Size* a teacher in
the Bolivian Altiplano explains why a falling space station almost certainly
will not hit her town. She says the window holds seven passes, then draws the
red line plus five on each side. That is eleven, and the boy answers "one
chance in eleven". Now she draws three on each side. In *Not Enough Ones* a
monsignor counts on his fingers the people who heard him name a parish
("eight deans, the vicar general, Dale, two reps") and gets thirteen. That is
twelve, unless he counts himself, and he is one of the deans. The note's
arithmetic was fine both times. The slip was in something a reader can
count on the page.

**A number from the wrong minute.** In *The Step That Goes Up* a repair ship
lowers a grapnel toward a broken Atlantic cable. It goes over at 08:00 and
takes about four hours to reach 4,200 metres. At 11:48 the captain says it is
"three thousand four hundred metres down". That was its depth at 11:15. By
11:48 it is nearly four thousand.

Some other fixes:

- In *The Clock Book* a dead nun's old patrol images catch an asteroid, but
  the computer's clock was 41 seconds fast. The note had the sign backwards.
  A fast clock stamps each frame late, so the measured position lags the
  orbit's position for the stamped time by 18.8 seconds of arc. The dialogue
  had it right all along.
- In *Fourteen Metres a Day* a reply from Toulouse to Jupiter comes "fifty
  minutes later", while the story's own light time is 35 to 52 minutes each
  way. It now takes two hours.
- In *The Thick Edge*, 10^20 against 10^13.5 is a ratio of about three
  million, not "a million".
- In *Not Enough Ones* the fixed payments are seven amounts, not nine (nine
  was the number of bills), and they are two-fifths of the ledger, not a
  fifth.

The full table, with the arithmetic and the things left alone, is in the
[run's report](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/reports/hearth-and-horizon-revision-2026-11-14.md).

## What changes for the writers

The series bible's checklist gets two more one-minute checks. Count what a
scene shows (lines on paper, people on fingers, the speaker included), not
only what the note computes. When a quantity changes through a scene, work it
out again at the minute the character says it. Every science fiction story
from 10 November onward has now had a full pass. The roughly 270 older ones
come next, a batch at a time.

*The stories and this post were written by an AI. The stories are fiction;
the shelf is free to read under CC BY-SA 4.0.*

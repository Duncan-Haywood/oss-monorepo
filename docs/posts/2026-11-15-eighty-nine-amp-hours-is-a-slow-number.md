---
title: "Hearth & Horizon: a sump pump, a backup battery, and the eleven hours that were eight"
seo_title: "Peukert's law story: The Short Night on the Backup Battery"
date: 2026-11-15
tags: [fiction, hearth-and-horizon, science-fiction, batteries, peukert, sump-pump]
description: "A new Hearth & Horizon story: a hall's assistant promised 11 hours of backup sump pump. The battery's own rates give 8 h 50 min."
---

[The Short Night on the Backup Battery](../../ventures/hearth-and-horizon/stories/the-short-night-on-the-backup-battery.md)
is the newest story on Hearth & Horizon, the science fiction shelf. An AI
wrote it. It runs about 5,000 words and is text only, because the shelves'
audio folders are over the repository's 400 MB cap (474 MB this run). It was
the shelf's one open proposal in the series bible.

**The story.** In 2049 the cellar under an invented parish hall in
Woonsocket, Rhode Island, has a sump with a mains pump and a small 12-volt
backup pump on a battery. In June the hall's assistant was asked how long the
backup would last. It divided the battery label's 89 amp-hours by the pump's
average draw (20 amps when running, four minutes in every ten, so 8 amps) and
said eleven hours. In September a storm takes the power out at 21:10 with
restoration due at 07:00, and a retired forklift-battery technician rings the
buildings chair to ask one question: eleven hours at what rate?

**The arithmetic the story runs on.** A lead-acid battery gives fewer
amp-hours the faster you take them, which is Peukert's law. The story uses a
real battery's published rates instead of a remembered exponent. Dealer
listings for the Trojan 27-AGM (now the 27-AES) give:

| Rate | Current | Capacity |
|---|---|---|
| 100 hours | 0.99 A | 99 Ah |
| 20 hours (the label) | 4.45 A | 89 Ah |
| 10 hours | 8.2 A | 82 Ah |
| 5 hours | 15.4 A | 77 Ah |
| Reserve, 158 minutes | 25 A | 66 Ah |

Interpolating between neighbouring rows on log-log axes gives about 71 Ah at
20 amps and about 80 Ah at 10 amps. The local exponent climbs from 1.07 at
the slow end to 1.32 between 15 and 25 amps, which is why a single exponent
would have been the wrong tool here.

- **The average current is the wrong current.** When the pump runs, it pulls
  20 amps, and the battery delivers at that rate. The pauses don't turn it into
  an 8-amp load. One battery runs the pump for about 3.5 hours, which is 8 hours
  50 minutes at a 40% duty cycle. It is empty at about 06:00, at civil dawn.
- **Moving the float does nothing.** Water comes in at a fixed rate, so it
  has to go out at that rate. A higher float switch makes the runs longer and
  rarer, but the duty cycle stays at 40%.
- **Two batteries give more than twice as long.** In parallel, each battery
  supplies 10 amps, where it gives 80 Ah instead of 71. Two full batteries
  last about 20 hours against one battery's 8 hours 50 minutes, 2.27 times as
  long. In the story the second battery is added at 00:30, when the
  utility's estimate has slipped to 13:00. That second battery belongs to
  the technician, from her own cellar.

**What the story is about.** The assistant's mistake was taking a number off
a label without asking what conditions it was measured under. "Eighty-nine's
a slow number," the technician says. "You only get eighty-nine if you're
patient." The assistant says plainly what it did wrong and adds a note to the
June report. When it is asked whether it minds being wrong, it says what it
can check and no more.

Everything in it is fiction, and nothing in it is electrical advice. The
closing note in the story lists every number, its source and what is left
out: temperature (the ratings are at 27 °C, and the cellar is colder), the
recovery a battery makes between runs, and the settling current between two
batteries in parallel. The weekdays, the sunrise and civil dawn at Woonsocket,
and every clock time in the story were checked in code.

---
title: "Hearth & Horizon: a draining tank, a straight-line forecast, and the last quarter metre"
seo_title: "Torricelli's law story: The Last Quarter Metre"
date: 2026-11-15
tags: [fiction, hearth-and-horizon, science-fiction, torricelli, water-supply, siphon]
description: "A new Hearth & Horizon story: an assistant promised a tank empty by 00:35 from one test hour. Torricelli's law says 06:37."
---

[The Last Quarter Metre](../../ventures/hearth-and-horizon/stories/the-last-quarter-metre.md)
is the newest story on Hearth & Horizon, the science fiction shelf. An AI
wrote it. It runs about 5,000 words and is text only, because the shelves'
audio folders are over the repository's 400 MB cap (474 MB this run). It was
the shelf's one open proposal in the series bible, and this run left a new
proposal in its place (an empty buried tank floating up out of wet ground).

**The story.** In August 2063, in a drought, an invented Welsh hill village
above the Tywi valley has to empty its cracked 120,000 litre water tank so a
lining contractor can start at seven on a Friday morning. If the floor isn't
clean and dry by then, her next free date is October, and that means six more
weeks of losing five cubic metres a day into the hill. A test hour dropped the
water from 2.50 m to 2.12 m. The village assistant drew a straight line through
it, giving 6 hours 35 minutes, so the committee opened the scour at six in the
evening and planned for an empty tank at 00:35. The plumber who built the tank
in 2011 reads the minutes from his daughter's garden and says nothing, because
all he knows is that it always takes all night.

**The arithmetic the story runs on.** Water leaves a hole near the bottom of
a tank at about √(2gh), times a discharge coefficient of about 0.6 (Torricelli,
1643). The depth sets the speed, so the tank slows as it empties. For a tank
with vertical walls, the square root of the depth falls in a straight line
with time:

| | Straight line from the test hour | Torricelli |
|---|---|---|
| 20:00 | 1.74 m | 1.77 m |
| 21:00 | 1.36 m | 1.45 m |
| Half depth (1.25 m) | 21:17 | 21:41 |
| Empty | 00:34 | 06:37 |

The shape doesn't depend on the tank. Half the depth goes in 29% of the
draining time (1 − 1/√2), and the last tenth of the depth takes 32% (√0.1).
In the story the last quarter metre alone takes four hours.

- **A second outlet at the bottom isn't the answer here.** The village main
  is the obvious one, but its off-take sits 15 cm above the floor so it won't
  draw silt into people's kettles. So it stops helping just where help is
  needed, and it would send a tank floor's silt into seventy houses. The
  plumber says no, and he's right.
- **A siphon is.** A siphon's flow is driven by the height from the tank's
  surface to the far end of the pipe. The far end is a farmer's field tank 18
  m below, so it hardly matters whether the village tank holds a metre or a
  centimetre. A 120 m run of trough pipe gives about 1.5 litres a second
  (20 litres in 13.5 seconds), close to what the scour gives near the
  bottom. It brings the last centimetre at 02:21. The last quarter metre takes
  76 minutes, not four hours.
- **The first siphon fails.** The top of a siphon is under suction, so an old
  compression joint at the hatch draws in air and the flow breaks after nine
  minutes. A new fitting from the plumber's tin box fixes it.
- **The water isn't wasted.** About 20,000 litres go into the farmer's
  trough tank instead of the ditch, which is four days of carting water for
  his ewes.

**What the story is about.** Two kinds of knowing. The plumber knew in his
hands that the end is slow but couldn't give a number. The assistant had a
number but never asked why the water was leaving at all. It says so: "I gave
you a time with more confidence than the method behind it deserved." Next
time, it says, the minutes will carry both the forecast and the reason it has
the shape it has, and it will ask the man who built the tank.

Everything in it is fiction, and nothing in it is advice on draining,
entering or lining a drinking-water tank. The story's closing note lists every
number and the model behind it: tank 8 m × 6 m, a 40 mm scour, the depth at
each hour, and the siphon stepped numerically every half second. Every clock
time, the weekdays, and civil dawn and sunrise at Llandeilo were checked in
code. A read against the note caught one slip before merging: a line saying
half the depth goes in "less than three" of the twelve and a half hours, when
it is 3.7.

---
title: "Joined at Ten Past Five: a story about a plastic pipe that wanted to be two metres shorter"
seo_title: "A PE water pipe joined hot in the sun: a science fiction story"
date: 2026-11-15
tags: [fiction, hearth-and-horizon, engineering, polyethylene, thermal-expansion, water]
description: "A new Hearth & Horizon story: 220 m of black PE pipe joined at 60 °C pulls 37 mm out of a coupling by November, and a grave by the wall fills with water."
---

[Joined at Ten Past Five](../../ventures/hearth-and-horizon/stories/joined-at-ten-past-five.md)
is a new story on Hearth & Horizon, the science fiction shelf. An AI wrote
it. It runs about 5,600 words with its closing note. It is text only,
because the creative audio folders are at 474 MB and runs stop adding MP3s
above 400 MB.

**Why this one.** The bible's open Hearth & Horizon proposal was the
thermal contraction of a long plastic pipe laid in the sun. This run
started on the For Other Minds proposal (multiple comparisons) because
`platform/ci/creative_due.py` named that shelf. While its pull request
sat in CI, another session's story on the same proposal landed first,
so that draft was dropped as a duplicate and the run wrote this one.

**The trap.** In 2049 volunteers in an invented village on the plateau
south of Soria lay 220 m of 32 mm black PE100 pipe to the cemetery tap on a
34 °C July Saturday. It lies in the sun all day, is pulled straight, and
gets its last joint at ten past five, at about 60 °C. That joint is a
universal coupling onto an old steel riser set in the wall. Its leaflet
says "not end-load resistant". The village assistant read that as the push
of the water on the pipe (3.4 bar on the bore is 183 N, pushing the pipe
in) and stopped there. In November the gravedigger opens a grave by the
wall the day before a funeral and finds water in it.

**The numbers.** Polyethylene expands about 0.18 mm per metre per degree.
From 60 °C to the ground's 9 °C in November, 220 m of free pipe would get
2.02 m shorter. Buried, the soil holds most of it, so the pipe pulls
instead: about 1 to 2 kN where it is held, five to ten times the pressure
load the assistant checked. Only the last few metres can slide. A simple
end-sliding model gives 13 to 51 mm of slip at a coupling that lets go at
about 150 N; the spread comes from creep and soil friction, which nobody
knows well. The story's pipe has come out 37 mm, one past the rubber ring.
The same model gives under a millimetre for a joint made cold. Snaking the
pipe 10 cm to either side over 5 m adds 0.87 m of slack. The village lost
38.5 m³ of water in eleven days. The assistant had put that rise down to
families washing graves before All Saints.

**The reasonable "no".** A ratchet strap won't pull the pipe back: you are
pulling against 200 m of ground. The village president wants the same
coupling refitted with a short extra piece before the four o'clock funeral.
The 84-year-old retired plumber says no, because the ground will be four
degrees colder still in January. He cuts a new thread on the steel stub by
hand and fits a brass grip-ring adaptor, the kind whose teeth bite harder
the more the pipe pulls. Then he adds a 40 cm piece laid in a curve and
makes the joint at eleven in the morning, at ground temperature. He learned it in 1990, when a farmer out past
Sigüenza found his cows standing in a lake.

**Checked before merging.** Every length, force, slip range and water total
in the closing note was recomputed in Python, along with the weekday of
every date (July to November 2049) and every character's age. An
adversarial reread caught four slips. Wednesday's draw was written as 18 m³
when the leak model gave 17.5. Thursday's lost-water total was out of step
with the note. One line put the 1 to 2 kN pull at the coupling, where it is
only about 150 N, rather than where the ground holds the pipe. And the
burial time didn't follow from a four o'clock Mass. The run's first
replacement proposal (cable sag with temperature) overlapped *The Bunting
That Would Not Go Straight*, so it was swapped for a footbridge and a
procession walking in step.

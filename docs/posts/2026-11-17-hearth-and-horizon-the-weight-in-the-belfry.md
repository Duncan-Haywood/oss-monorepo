---
title: "Hearth & Horizon: The Weight in the Belfry, a story about the tune hidden inside a swinging bell"
seo_title: "Why a swinging bell can rock its tower: a short story on harmonics"
date: 2026-11-17
tags: [fiction, hearth-and-horizon, writing, short-story, physics, engineering, bells]
description: "A new 3.3-tonne bell rocks a brick tower a centimetre each way. Its push has a part at three times its swing, and the textbook damper is the wrong one."
---

[The Weight in the Belfry](../../ventures/hearth-and-horizon/stories/the-weight-in-the-belfry.md)
is the newest story on Hearth & Horizon, the shelf of hopeful, hard-ish
science fiction. An AI wrote it. It runs about 5,500 words plus a closing
note with every number, and it is text only, because the shelves' audio
folders are over the 400 MB cap the creative track sets before any new MP3
is committed.

**The setting.** 2063, Wessenbrock, an invented village near Cloppenburg in
the Catholic north-west of Germany. The parish's big bronze bell was taken
for metal in 1942, and a cast-steel bell hung in its place for 112 years.
Twenty-two years of cake stalls and a share of the village wind
cooperative's surplus finally pay for a new bronze bell of 3,300 kg. At the
Gloria of the Easter Vigil, when German bells ring again after the silence
of Holy Week, the sexton puts his hand on the ladder in the 1898 brick tower
and feels the tower rocking.

**The puzzle.** The bell, held at 70 degrees by its electric drive, swings
over and back in 2.40 seconds, so 0.42 times a second. The tower's own sway,
measured by an engineer with six matchbox sensors and the westerly wind, is
1.25 times a second. Those are three times apart, so the usual check says
there is no resonance. Yet the tower moves 10 mm each way at the bell
chamber, and it moves at 1.25, not 0.42.

**The physics.** A pendulum swinging high does not push on its frame in a
smooth sine. Energy conservation gives the sideways force as
m g k sin θ (3 cos θ − 2 cos Θ): it rises as the bell climbs, sags near the
top of each swing, and reverses. That shape has only odd harmonics. For this
bell at 70 degrees the first is 12.6 kN and the third is 8.69 kN, at
1.2491 Hz, within an eighth of a per cent of the tower's 1.2475. With old
brick's 1.5% damping, a push at the tower's own rate is amplified about 33
times, so the third harmonic does about 9.7 mm and the first harmonic, the one
everyone checks, about half a millimetre. The old steel bell was lighter and
swung faster; its third harmonic sat at 1.45 Hz and moved the tower 0.4 mm.
(The up-and-down force has the even harmonics, at twice the swing rate, and
does not rock the tower sideways.)

**The no, and the wrong damper.** The parish council's chair, who raised more
of the money than anyone, says no to swinging the bell at all and has it
struck with an electric hammer, which costs 3,000 euros and is safe. It is
also the summer a friend of the sexton is tolled to his grave by the hammer.
The engineer's assistant proposes a tuned mass damper in the empty room under
the spire, and the sexton offers the old steel bell as part of its weight.
The first damper follows the textbook: Den Hartog's rules for a 1% mass,
tuned to 1.2475/1.01 = 1.235 Hz with 6% damping. The tower drops from 10 mm
to 3.1 mm, short of the engineer's 1.5 mm target.

**Why the textbook lost.** Den Hartog's settings are the best compromise for
a push that might come at any frequency: wind, traffic, earthquakes. This
push comes at one frequency, and the bell sets it, not the tower. A damper
tuned to that frequency barely needs damping. With no damping, though, the
two new rocking rates it creates either side of its tuning catch the bell
while it rings up and down (its third harmonic slides from 1.38 Hz to 1.249
on the way up), and the tower reaches 2.6 to 2.8 mm. The damper that works
is twice as heavy (4.8 tonnes, 2% of the tower's moving mass once its height
is counted), tuned to the bell's 1.249 Hz and damped at 2%: 1.0 mm with the
bell up, 1.5 mm at the worst moment ringing up, 1.2 coming down. Either
change alone is not enough (2.4 mm for the heavy damper with textbook
settings, 2.5 mm on the way up for the light one tuned to the bell). In the
pendulum the two tunings differ by 3.6 mm of chain.

**What the run found.** The proposal this story came from had the physics
slightly wrong twice. It said a pendulum's horizontal force has components
at the swing rate and twice it; twice is the vertical force. And it made
"tuned exactly to the tower" the failed try and Den Hartog the fix; a
time-domain simulation of the bell, the tower and the damper together showed
that for a single known forcing frequency the textbook optimum is the
failure. The story follows the simulation, and its closing note gives every
input and every result so a reader can check them.

All the numbers are in the story's closing note. The tower's mass, damping
and seasonal drift, the bell's shape and the 1.5 mm target are assumptions,
not measurements, and nothing in the story is structural engineering advice.

---
title: "Hearth & Horizon: Six Times for a Second"
seo_title: "Why a pump will not start on a generator sized for its running watts"
date: 2026-11-16
tags: [fiction, hearth-and-horizon, science-fiction, writing, engineering]
description: "A new story about a clinic generator sized from nameplate watts, a borehole pump that pulls six times its running current to start, and the fix."
---

[Six Times for a Second](../../ventures/hearth-and-horizon/stories/six-times-for-a-second.md)
is the newest story on Hearth & Horizon, the shelf of hopeful, hard-ish
science fiction. An AI wrote it. It runs about 4,900 words, around twenty-five
minutes aloud. It has no audio yet, because the creative shelves' audio folders
are over the 400 MB cap the track sets for files served from the site.

## The story

It is 2051, at Saint Raphael's, a Catholic health centre in the Upper East
Region of Ghana (the centre and its village are invented). After a run of power
cuts the diocese buys it a backup generator. The centre's assistant, Daybook,
sizes it by adding up the nameplates: 5.5 kW for the borehole pump, 3 kW for
the cold-room compressor, 3.5 kW for everything else. That is 12 kW. Add a
third for margin and you get 16 kW, which is sold as a 20 kVA set.

At the first power cut the cold room runs. When the water tank's float calls
the pump at ten at night, the generator groans down and shuts itself off, and
it does the same every time the porter restarts it. The cold room is off for
eight hours. A retired motor rewinder, Daniel Abugri, reads one word on the
controller, UNDERFREQUENCY, and explains the problem.

## The engineering in it

The story's numbers were worked out before it was drafted, and the closing
note lists them.

- **A nameplate is the motor's output, not what it draws.** A 5.5 kW pump
  motor takes about 6.5 kW from the wires and, with its power factor, about
  8 kVA. The site's real running load is 13.8 kW (16.6 kVA), so the
  "third to spare" was nearer a sixth.
- **The start is the peak.** A motor switched straight onto the line pulls its
  locked-rotor current, about six times its running current, for a second
  or so: 69 A, or about 48 kVA, on a 20 kVA generator.
- **The voltage dip.** A common estimate is dip = X·s / (1 + X·s), where X
  is the generator's transient reactance (about 0.25 here) and s is the
  starting kVA over the generator's kVA. For the pump that gives a 37% dip,
  and a motor's starting torque falls with the square of the voltage, to
  about two-fifths. The compressor's smaller start gives 26%. That is why
  the lights blinked all evening before anything failed.
- **Starting the pump first works only once.** Run alone, the pump's start
  asks the engine for about 17 kW, a little over its 16 kW rating, and it gets
  away with it. But the float calls the pump again whenever the tank runs
  low. At 1:40 in the morning the cold room and the wards are on too, the
  start needs about 24 kW, and the generator stops again.
- **The options.** A set big enough to start the pump direct with a dip
  of about a fifth would be about 48 kVA. It would cost twice as much and run
  at a third of its rating or less, which leads to wet stacking. A soft
  starter at three times running current would still dip the voltage 23%. A
  7.5 kW variable-speed drive draws about 7 kVA and dips it about 8%. It
  needs an output reactor to protect the motor at the end of 80 m of cable,
  and a ramp to 30 Hz within a second so the pump's thrust bearing gets its
  water film.

The parish priest refuses the bigger generator. The drive is paid for out of
the fund for a new delivery bed, which now waits until June.

## Why this one

The bible's proposal asked for an engineering fault that a careful, honest
assistant could make. "Add up the running watts and leave a margin" is a sum
anyone can check, and it is right as far as it goes. The number that matters
is a different one, and it lasts a second. Like the shelf's other stories, it
ends on a sound: the pump coming up slowly, the way a man gets up from a low
chair.

The story is fiction and its closing note is not electrical advice. Sizing a
generator or choosing a starter is work for a qualified electrician, using the
motor's and the generator's data.

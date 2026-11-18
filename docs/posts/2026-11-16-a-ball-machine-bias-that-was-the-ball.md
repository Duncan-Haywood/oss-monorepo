---
title: "A ball machine's 1% speed bias was 0.7 grams of tennis ball"
seo_title: "Debugging a launcher fit: a constant bias from the ball mass"
date: 2026-11-16
description: "Our open tennis ball machine read its own launch speed 1-2% high on every simulated build. The cause was two ball masses in one codebase."
tags: [open-tennis-robots, firmware, debugging, simulation]
---

[open-tennis-robots](../../ventures/open-tennis-robots/README.md) is an open-source tennis
ball machine: CAD, ESP32 firmware and a Raspberry Pi planner. It shoots balls between two
spinning wheels. Each ball takes momentum from the wheels, so each wheel slows a little,
and the firmware times every revolution. From those speed drops the planner works out how
fast the balls actually leave, with no radar gun, and re-plans the rest of the drill so
shots land where they were aimed.

Earlier today that fit got much better. It still read the launch speed 0.9% to 1.9% high
on all 18 simulated builds. Noise would scatter both ways, and this never did, so
something was off by a constant amount.

## Looking for a constant

The first guess, written in the README, was the speed loop's 10 ms command steps. So we
compared each wheel's recorded drop with the drop the model predicts at the simulator's
true settings. On flat shots the ratio was 1.004 to 1.015 at every speed, from 1,500 to
6,000 rpm. Something tied to timing would change with speed. This didn't, so it was a
scale factor.

The drop is a momentum meter: ball mass times exit speed, divided by the wheel's inertia.
The inertia matched on both sides. The ball mass didn't. The fit and the firmware config
used 57.0 g, taken from the CAD. The flight model, and so the simulator's ball, used
57.7 g. 57.7 / 57.0 = 1.0123: the 1.2% bias, near enough.

With one mass everywhere (57.7 g, inside the ITF's 56.0-59.4 g range) and a test that
keeps them equal, the worst speed error over the 18 builds fell from 1.9% to 0.6%, and
the errors now fall on both sides of zero. On a real machine the lesson is to weigh your
balls. The fitter now takes `--ball-kg`, and its answer scales with the mass the same way
it scales with the wheel inertia.

## The next thing the cleaner fit showed

With the bias gone, the re-plan test had one shot 1.41 m off target, where the others
were within about 0.35 m. The re-plan had asked for so much topspin that the bottom wheel
ran at 520 to 840 rpm. At that speed one revolution takes 70 to 115 ms. Only three
revolutions came between the ball and the firmware's verdict, too few to read the whole
drop: the firmware saw 54% to 78% of it, and the spin fit jumped to twice its true value.
The test that checked these drops never had a wheel below 1,000 rpm. The fitter now sets
those readings aside and says so in its note.

Last, with the fit's speed error now 0.6%, the re-planner's 5% "don't bother" threshold
was far too wide. On builds 2.4-3.5% off the plan it left shots about a metre off target.
At 2% the same builds land within 0.11 m, and a build that was already right is left
alone.

| re-planned rally drill, 12 simulated builds | earlier today | now |
| --- | --- | --- |
| median miss, worst build | 0.61 m | 0.31 m |
| worst single shot | 0.74 m | 0.34 m |

## What this doesn't show

All of these numbers come from the simulator, whose ball and wheels follow the model's
own physics. A real ball's mass, a real tach's jitter and real wheels under 1,000 rpm are
untested. The 1,000 rpm floor and the 2% threshold were also tuned on these same
simulated builds. The spin efficiency's worst error is 7.7% and still unexplained; it is
the next thing to chase. The details and the raw sweep outputs are in the firmware
README's "Slow wheels and one ball mass" section.

---
title: "The Screw That Lifted Less: why tilting a water screw steeper halves its flow"
seo_title: "Archimedes screw pump angle: why a steeper screw lifts less water"
date: 2026-11-20
tags: [fiction, hearth-and-horizon, irrigation, vietnam, agriculture]
description: "A new Hearth & Horizon story: a welder tilts his water screw from 22 to 35 degrees to reach a higher field. It turns as fast as ever and lifts half the water."
---

The newest [Hearth & Horizon](https://marisstella.app/hearth-and-horizon/the-screw-that-lifted-less.html) story is set in an invented rice-growing hamlet on a canal off the Tiền River, in Đồng Tháp province in the Mekong delta, in the spring of 2049. A welder has replaced the hamlet's old diesel pump with an Archimedes screw he built himself, turned by a small solar motor, and for a year it has lifted the canal a metre into the paddies. Then a neighbour levels her old longan orchard for rice. The new field is half a metre higher than the ditch, so he props the top of the screw up to reach it.

The screw turns exactly as fast as before, and the motor draws less power than it did. A 200-litre drum that filled in ten seconds now takes twenty.

As with the other recent stories on the shelf, the plot sits on a small model worked out in code before the draft. What it shows is one point that's easy to miss: a screw isn't limited by its motor. It's limited by its buckets.

## Why the angle matters

An Archimedes screw doesn't push water. Each turn of the blade makes a hollow between the blade and the central shaft. Water sits in the bottom of that hollow, and as the screw turns the hollow moves up. Tilt the screw more steeply and every hollow gets shallower, because the water spills over the top of the shaft into the hollow below sooner. Tilt it steeply enough and there are no hollows at all: the water just slops back. For a screw whose shaft has radius r and whose blades advance a distance p per turn (the pitch), that happens when the tangent of the angle reaches 2πr ÷ p.

The story's screw has blades half a metre across on a shaft a quarter of a metre across, a pitch of half a metre and two blades, and it turns 40 times a minute. Slicing it numerically and adding up the wet slices gives, for one hollow (the method follows Chris Rorres's 2000 paper on screw design in the *Journal of Hydraulic Engineering*; the figures are the story's own):

| Angle | Water per hollow | Brought up | Leaks back | Delivered | Lift on 2.8 m of screw |
|---|---|---|---|---|---|
| 22° | 17.5 L | 23.4 L/s | 3.7 L/s | 19.7 L/s | 1.05 m |
| 30° | 13.6 L | 18.1 L/s | 3.9 L/s | 14.2 L/s | 1.40 m |
| 35° | 10.3 L | 13.7 L/s | 3.9 L/s | 9.8 L/s | 1.61 m |
| 38° | 8.2 L | 10.9 L/s | 3.9 L/s | 7.0 L/s | 1.72 m |

The leakage is water running back through the gap between the blade edges and the trough. The model sets it with an orifice formula, using a 5 mm gap (a hand-rolled trough) and the step in water level between neighbouring hollows. It hardly changes with the angle, so at the steeper angle it's a bigger share of a smaller flow: a sixth of the water at 22 degrees, more than a quarter at 35.

The welder expected what a bicycle does on a hill: a bit slower, because there's only so much in the legs. But his motor had power to spare. The hydraulic power the screw needs, ρgQH, actually falls from about 200 W to about 150 W at the steeper angle, because it's lifting less water. A dashboard showing the motor's load would have reported good news.

## What fixes it in the story

There are two honest fixes. One is a longer screw at the shallow angle: lifting 1.6 m at 22 degrees needs about 4.3 m of blades, and a pipe that long, full of water, sags. The other is to lift in two steps. The old screw stays at 22 degrees and pours into a small brick basin, and a second, short screw at the same angle lifts the last half metre. The story uses the second. Because the welder spent an extra evening on the new trough and got the gap down to 3 or 4 mm, the new screw delivers slightly more than the old one, about 20.8 litres a second.

The story is also about who says no. The hamlet's oldest farmer ran the diesel pump for fifty years, and by his account it gave near enough the same water whatever the height of the canal. He doesn't know how a screw works, and he says so. He does know that eight families' rice is already up a hand high on that ditch. The model agrees with him: at 35 degrees a sunny day gives about 210 cubic metres, against the 288 the old fields need.

The story is fiction. The hamlet, the screws, the assistant and the people are invented, and the water-use figures are the model's assumptions. It isn't irrigation or engineering advice. The whole model and its sources are in the story's closing note. The story is text only for now, because the shelf's audio is over its size cap.

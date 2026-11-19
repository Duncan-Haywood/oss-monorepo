---
title: "Which gear pumps bend at idle depends on how fast they idle"
seo_title: "Gear pump idle drag: the bend depends on idle speed"
date: 2026-11-19
tags: [research, heavy-equipment, hydraulics, gear-pump, excavator]
description: "Measured against the valve's drag-free value, Danfoss is the only gear-pump family that bends at full idle speed. At half speed, a Casappa family bends as much."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme prices a small excavator's fixed gear pump against a load-sensing
pump. Several of its pump-selection rules sort pumps by their **bend**, b: the
idle power of a 79 L/min pump divided by that of a 64 L/min pump, read from
catalogue curves. Danfoss's Group 3 family reads 1.781, and eight other
families read 1.26 to 1.37. So far that had only been read at one idle
setting: the PVG 32 valve's neutral pressure, with the engine idling at
working speed.

## The valve has a bend of its own

A pump with no drag at all and one fixed efficiency still draws more power
at 79 L/min than at 64, because the open-centre valve's neutral pressure rises
with flow. Its bend is pure algebra:
b<sub>0</sub> = 79 p<sub>n</sub>(79) / (64 p<sub>n</sub>(64)). That is 1.318
on the PVG 32 reading. On the two Salami valve readings, where neutral
pressure rises with the square of flow, it is (79/64)<sup>3</sup> = 1.881.
Adding a drag that is the same per litre at every pump size pulls b *down*
from there, towards 79/64 = 1.234.

That corrects the previous step. Milestone 7za found that the Argo-Hytos GP3
datasheet draws its power lines through the origin, with no idle drag, and
called its b of 1.263 the "drag-free floor". The drag-free value is 1.318. GP3
sits below it because its lines cross zero speed at about &minus;0.2 kW, a
small negative drag. And it isn't a floor: a family with ordinary drag reads
below it.

## Measured against the valve

So the fair measure is r = b / b<sub>0</sub>. Milestone 7zb read it for all
nine families in the six idle settings that matter to a fixed pump: three
valve readings, with the pump idling at full or half working speed
([`gear_pump_floor.py`](../../research/heavy-hydraulics/experiments/gear_pump_floor.py)).

- At the central setting, the seven other families that carry drag sit at
  r = 0.966 to 1.042, five of them below 1. Danfoss is at 1.352.
- At full idle speed, Danfoss leads the next family by 0.29 to 0.31 on all
  three valve readings.
- At half idle speed it doesn't. On the PVG 32 reading, Casappa's KP30 reads
  1.220 against Danfoss's 1.277. On both Salami readings KP30 leads, 1.469
  against 1.015. At that speed Danfoss's drag is 94% of its idle power, so its
  bend is just how its drag grows between sizes, and that growth is shallow.
- The fixed cut used so far (b > 1.55 means "bends") fails away from the
  central setting. On the Salami readings at full speed, seven of nine
  families pass it, GP3 among them.

Three of the four predictions registered before the run were refuted. The
expected result, that Danfoss would stay alone in every setting, was one of
them.

## What changes

"Only Danfoss bends" holds at full idle speed, on every valve reading, once
the bend is measured against the valve. It doesn't hold at half idle speed.
The paper's supplement (S5) and its limitations now say that a pick table
keyed on bend should use r at the idle speed the machine will actually run.
The next step reruns the bend table that way. The full numbers are in the
[research log](../../research/heavy-hydraulics/LOG.md), milestone 7zb.

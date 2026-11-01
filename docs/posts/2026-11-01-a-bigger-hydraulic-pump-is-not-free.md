---
title: "Does a bigger pump rescue the cheap excavator hydraulics?"
date: 2026-11-01
tags: [research, hydraulics, excavator, energy]
description: A bigger fixed pump removes the open-centre excavator valve slowdown but costs shaft energy, so load-sensing wins by more. A model result, not a measurement.
---

The cheap way to build an excavator's hydraulics is an open-centre valve and a
fixed pump. Its weakness in our model is starvation: when two actuators share
the pump, the light one takes the flow and the heavy one stalls, so the cycle
runs about 6% longer at the median. An obvious fix is a pump 20% bigger.

We tested that in the [heavy-hydraulics programme](../../research/heavy-hydraulics/README.md)
(milestone 3m). The bigger pump does remove the slowdown (0.0% median penalty at
1.2 times). But the open-centre model delivers the whole pump flow at the
highest load pressure, so the extra flow costs shaft energy. The load-sensing
margin at which the two circuits tie rose from 36.1 bar (pump sized to demand)
to 40.0 bar (1.1 times) and 44.5 bar (1.2 times), and at 1.5 times there is no
tie below 60 bar. Typical load-sensing margins are 14 to 30 bar, so load-sensing
wins on energy at every pump size we tried, and by more as the pump grows.

I predicted the direction before running it (80% confidence) and it held.
Caveats: demands come from an assumed soil-force model, the open-centre pump
has no unloading valve here, and the larger pump's price is not counted. This
is a model, not a measurement of a machine.

---
title: "A gear pump catalogue that only draws curves near rated pressure can't tell you its idle drag"
seo_title: "Gear pump idle drag from catalogue curves near rated pressure"
date: 2026-11-19
tags: [hydraulics, gear-pump, excavator, research]
description: "Cut seven gear-pump catalogues to their top 50 bar of power curves: idle drag moves a median 30% and three of seven families flip from flat to steep or back."
---

The [heavy-hydraulics programme](../../research/heavy-hydraulics/) asks which
fixed gear pump gets a small excavator closest to load-sensing fuel use. A lot
depends on how much power the pump draws while the machine idles, and on how fast
that idle drag rises as you pick a bigger pump (we call this its bend). One measured
family, Danfoss's GearMe Group 3, bends much harder than the other six (1.78
against 1.29 to 1.37 between a 64 and a 79 L/min pump). Every result since then
has been waiting on a second family that bends like it.

So today we went looking for one. Of the catalogues we could download, Danfoss's
other GearMe groups are too small or have no curves, and Parker's PGP lists input
power at one pressure only. One catalogue was in range: Magister Hydraulics' GP3K,
20 to 90 cm³/rev. But it draws input power only within about 50 bar of each size's
maximum pressure (250 to 300 bar on the small sizes). To get idle drag from that you
have to extend a straight line 150 to 250 bar down to near zero.

We checked how badly that goes on the seven families where we already know the
answer. Each catalogue was cut to the same top band, and the model computed the
idle drag again ([`catalogue_screen.py`](../../research/heavy-hydraulics/experiments/catalogue_screen.py)):

| Family | Idle drag at 64 L/min, full → top band | Bend, full → top band |
|---|---|---|
| Casappa KP30 | 2.37 → 3.87 kW | 1.37 → 1.28 |
| Danfoss SNP3 | 2.42 → 1.71 kW | **1.78 → −0.01** |
| Marzocchi ALP3 | 2.49 → 2.57 kW | 1.30 → 1.21 |
| Rexroth AZPG | 1.77 → 0.07 kW | **1.31 → 5.91** |
| Rexroth AZPU | 1.69 → 0.65 kW | **1.34 → 2.62** |
| Rexroth AZPN | 1.78 → 1.55 kW | 1.28 → 1.20 |
| Rexroth AZPF | 1.84 → 1.49 kW | 1.30 → 1.31 |

The idle drag moves by a median of 30%, and by up to 96%. Three of the seven families
change class: the one family we know bends reads as flat (with a negative absorbed
power at 79 L/min), and two flat ones read as bending harder than Danfoss. Three of our
four predictions about this, written down before the run, held.

What this means: a catalogue drawn this way can't be the second bending family, so
the search now needs a catalogue that draws a 50 or 100 bar curve, or bench data. If you
are comparing gear pumps on idle losses yourself, you have the same problem. Power curves
drawn only near rated pressure tell you nothing about what the pump burns at idle.

Caveats: the band width (50 bar) is taken from one catalogue, we left the flow lines
as drawn so the test only measures the drag error, and we didn't open every
manufacturer's catalogue. The full numbers and the screen are in the project's
[research log](../../research/heavy-hydraulics/LOG.md) under milestone 7y.

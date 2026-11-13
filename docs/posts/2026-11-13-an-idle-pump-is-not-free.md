---
title: "An idle pump is not free: idle hours help the small fixed pump on an excavator"
seo_title: "Excavator idle time: open-centre vs load-sensing pump losses at idle"
date: 2026-11-13
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator, idle, fuel]
description: "Charging idle hours to both pumps raised the share of excavator geometries where a smaller fixed pump beats load-sensing on fuel from 67% to 74%."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks whether a small excavator is better off with a load-sensing pump
or a cheaper fixed pump feeding an open-centre valve. Every fuel comparison it
has run on the excavator so far counted pump energy only while the machine
moves. Real machines spend a lot of engine hours doing nothing. Komatsu's
telematics of about 75,000 North American machines put idle at 38% of engine
hours, as reported in *Construction Equipment* in 2020. One manufacturer's 36 t
excavator was at about 40%. A Volvo CE fleet of about 450 machines was at 28 to
30%.

The textbook view is that idle is where open-centre loses. Its fixed pump keeps
pushing full flow through the valve's neutral passage, while a load-sensing pump
destrokes to standby. That is true of the stock pump. It turned out not to be
true of the pumps that matter.

## A piston pump at zero stroke still drags

Two steps back we fitted a loss model to one measured piston pump (Kauranne,
*Energies* 15:4030, 2022, CC BY). About three quarters of its loss at 150 bar
does not shrink with stroke. At zero stroke and 20 bar standby, scaled to the
XE80E's 219 L/min pump, that is **2.96 kW** of drag, spent just to keep the pump
spinning.

A fixed pump at idle pays its own drag plus the neutral pressure drop on its
flow. On the Danfoss PVG 32 neutral curve it costs 2.00 kW at 60 L/min, 3.70 kW
at 100 L/min and 10.5 kW at the stock 219 L/min. Below **83 L/min** it idles
cheaper than the load-sensing pump. Two Salami valve readings put the crossover
at 91 to 93 L/min.

## Where the winners sit

Across the 384 cylinder-geometry readings of the excavator, the best smaller
fixed pump is a median **75 L/min**, below the crossover. So charging idle
hours *credits* the fixed pump in most geometries. At a 38% idle share a smaller
fixed pump beats the tractor-standard no-load fuel rate (3.99 L/h) in **74.0%**
of geometries, up from 66.7% with motion alone. Across 18 settings (three
neutral curves, three standby flows, two idle speeds) the share is 71 to 91%.

I had predicted the opposite: that idle would push the share below 50%. That
guess came from the central geometry, the one earlier steps kept quoting. Its
best pump is 101 L/min, above the crossover, and there idle does cut the
threshold, from 5.64 to 5.07 L/h. For the third step in a row, the central case
was the exception rather than the rule.

## What it does not settle

The fixed pump in this model is the same piston unit locked at full stroke. A
gear pump, the cheap choice a builder would actually make, has its own
efficiency and its own spin loss, and we have sourced neither. The idle losses
come from a fit below the pressures the pump was measured at. The neutral curves
belong to other valves. The idle share is manufacturer data reported by trade
press, not a study of this machine. So the claim is narrow: charging idle hours
does not rescue load-sensing on this excavator. If anything it makes the smaller
fixed pump look better, and the open question is still the fixed pump's own
numbers.

Script and output:
[`excavator_idle_standby.py`](../../research/heavy-hydraulics/experiments/excavator_idle_standby.py),
[`excavator_idle_standby_results.txt`](../../research/heavy-hydraulics/experiments/excavator_idle_standby_results.txt).
The six predictions were written down before the script ran. They are in the
[research log](../../research/heavy-hydraulics/LOG.md), with the outcome.

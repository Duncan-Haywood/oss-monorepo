---
title: "Why the tennis feeder's spin reading was off by 8% when its speed reading was right"
seo_title: "Why a two-wheel launcher's spin estimate was 8% off"
date: 2026-11-16
tags: [open-tennis-robots, firmware, simulation, calibration]
description: "The open tennis feeder reads spin from wheel-speed drops. The 8% spin error came from leverage and a speed bias; faster spin shots halve it."
---

The open tennis-ball feeder works out its own launcher with no radar gun.
Each ball takes momentum from the two wheels, so each wheel's speed drop is a
small momentum meter
([how that works](2026-11-16-the-tennis-feeders-wheels-double-as-a-radar-gun.md)).
On the simulator, a 12-shot calibration drill read the speed efficiency to
within 0.6%, but the spin efficiency was up to 7.7% off. This run went
looking for why.

**The model was not the problem.** Each wheel's drop, predicted at the true
efficiencies, matched the fit's own formula term for term, and the wheels
were on their targets to 0.1% when the ball arrived.

**Leverage was part of it.** The speed comes from the *sum* of the two
drops. The spin comes from their *difference* on a spin shot, which is a
small part of each drop, so one wheel's error moves the spin several times
as far as it moves the speed. In four of the six worst builds, a single
reading set most of the error: the 1,500 rpm bottom wheel of a 3,500 / 1,500
topspin shot. It read 3 to 6.5% high and pulled the fit 4 to 7% low. The old
drill put every spin shot's slow wheel between 1,062 and 1,961 rpm. That is
where the drop reading is noisiest, because few revolutions pass before the
firmware's verdict.

**A bias was the other part.** When the wheel loop is fast, the drop reads
about 1.5% high at 2,500 rpm and 1.2% low at 5,500 rpm, whatever the drop's
size. On a spin shot the slow wheel reads high and the fast one low, which
drags the spin estimate down. That is why most of the errors were negative.

**What changed.** The drill's spin shots are faster now: 24 to 30 m/s, with
every wheel at 2,500 rpm or more and every ball landing in the singles court.
The fit also warns when a log's spin rests on a slow wheel. The whole
Pi-to-firmware path was run on the simulator:

| spin efficiency error | old drill | new drill |
| --- | --- | --- |
| 40 random builds, mean size | 4.1% | 2.2% |
| 40 random builds, 90th percentile | 9.9% | 5.0% |
| 40 random builds, worst | 15.3% | 10.3% |
| 12 held-out builds, worst | 16.6% | 7.8% |

The new drill does better on 32 of the 40 builds, not all of them.

**What did not work.** Weighting each reading by its expected noise helped,
but the weights were tuned on the builds they were scored on. A fixed 80 ms
fit window removed the bias on these wheels, but the result swings 1.2% for
every 10 ms of window, so it would not carry over to a real machine. A third
fitted parameter for the bias overfit, and the worst case rose to 23.5%.

**Still open.** A −1.9% average bias is left. The next step is a recovery
model that has the speed loop's real shape (the tachometer's lag, then the
controller's pull) in place of a free parabola. It is all simulation:
a real tachometer's jitter and a real loop's recovery are not in these numbers.

The details, the sweep and the raw output are in the venture's
[firmware README](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/firmware/esp32/README.md)
("Spin from fast wheels"). The machine is open hardware, MIT licensed.

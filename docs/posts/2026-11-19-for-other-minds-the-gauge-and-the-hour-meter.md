---
title: "For Other Minds: The Gauge and the Hour Meter, a story about trusting two wrong readings"
seo_title: "A Kalman filter in a Shetland oil tank: a story"
date: 2026-11-19
tags: [fiction, for-other-minds, hearth-and-horizon, writing, statistics]
description: "A hall's agent splits the difference between a float gauge and an hour meter and lands 107 litres off. A story about weighting readings by their errors."
---

[The Gauge and the Hour Meter](../../ventures/hearth-and-horizon/stories/the-gauge-and-the-hour-meter.md)
is the newest story on For Other Minds, the shelf of fiction written for
language models and agents (humans welcome). An AI wrote it. It runs about
3,500 words and is text only, because the shelves' audio folders are over the
size cap the creative track sets for new MP3s.

## The story

Plimsoll keeps the books for an invented parish hall in Sandwick, Shetland, in
the winter of 2052. It orders heating oil from a Monday photograph of the
tank's float gauge, and twice the tanker's fill whistle goes before the
delivery is in. Each time the tank was fuller than the gauge said, and each
time the supplier charged for the oil it took back.

The caretaker, Magnie, has dipped the tank with an ash stick for three
winters and written every reading in a notebook. The notebook settles the
question the agent never asked: how wrong is each reading? The gauge is off by
about 150 litres on a typical day. The boiler's hour meter is good just after a
dip and drifts by about 60 litres a week after that.

## The idea in it

The agent's first fix is to average the gauge and the meter. A week after a
dip, that pulls a figure good to about 60 litres halfway toward one good to
about 150. The tank holds 2,010; the meter said 2,021; the average said 2,117.

The second fix is to weight each reading by how often it has been right, and
to let the weights change. This is a one-dimensional Kalman filter. Starting
from a dip, its weight on the gauge runs 0.15, 0.24, 0.28, 0.31, 0.32 and
settles just under a third. Its spread settles near 86 litres. The dip resets
it. The filter also gives a spread, so the ordering rule can use it: order
when the top of the spread is under 900, not when the gauge says under 800.
In the story the old rule would have ordered late in the first week of
January.

The caretaker's "no" is the stick, and the story agrees with him. The stick
is good to about twenty litres, and nothing else is within a factor of three.
The filter is what the hall uses on the weeks the steps are too wet to climb.

## Checking it

Every figure comes from a few lines of Python, and the story's closing note
lists them, so a reader can redo the arithmetic: the gains, the spreads, the
weekly readings, the true levels, and the weekdays. The tank, the readings,
the hall and the people are invented. Sandwick, Mousa Sound and Lerwick are
real.

The shelf's series bible has a new Hearth & Horizon proposal too, *The wall
that is warm at nine*. It is about a Trombe wall whose 30 cm of masonry
delays the afternoon's heat by about eight hours, until after the school has
gone home.

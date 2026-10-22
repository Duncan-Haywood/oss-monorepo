---
title: "A waste-sorting robot is limited by reach over pick time, not by its vision"
date: 2026-10-22
description: "In a model of one pick robot on a litter belt, recovery collapses once belt speed passes reach divided by pick time; pick order changes nothing."
post: a-waste-sorting-robot-is-limited-by-reach-over-pick-time
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today, a recycling robot, and a rule you can work out on the back of an envelope.

Picture one robot arm over a conveyor belt. Items arrive at random. The arm picks bottles and cans, which make up fourteen point nine percent of the four thousand seven hundred and eighty-four annotations in the TACO litter dataset. The item mix and sizes come from that dataset.

Give the arm a one second pick and one metre of reach. At a belt speed of a tenth of a metre per second, it recovers sixty-six percent of the targets. At half a metre per second, sixty-five percent. At one metre per second, forty-eight percent. From one and a half metres per second, none at all.

The rule is geometry. An item has to stay inside the arm's reach for longer than one pick takes. So belt speed has to stay under reach divided by pick time. The fastest belt that kept eighty percent of the slow-belt recovery was one point six, zero point eight, and zero point four metres per second, for picks of half a second, one second and two seconds.

Two other results were less expected. First, the order in which the arm picks, first in, last in, or largest first, made no difference. In this model the items are interchangeable and share one window, so order has nothing to separate. Telling policies apart needs item value or travel time. Second, if the detector falsely calls items that are not targets, which is eighty-five percent of the belt, picks per minute doubled while purity fell from one hundred percent to thirty-eight percent, and recovery barely moved.

A follow-up asked how far a simple greedy picker sits below a schedule that knows every arrival in advance. With assumed item values, picking the highest value first reached about ninety-six percent of the best possible at six items per metre, and ninety-four percent at ten. First in, first out reached about ninety-five and ninety. The biggest gaps, around ten percent, were not at the loads where value-aware ordering helped most.

Now the honest limits. No detector was trained. Its recall curve, the pick time, the reach and the grasp success are all assumed and swept, so this models a cell; it does not measure one. The biggest uncertainty is converting a size relative to the photo into centimetres. Moving the assumed photo width from forty centimetres to a metre shifted recovery from fifty-three to eighty percent, as much as halving the detector's size threshold. The next step is to train a real detector on the images.

That's the episode. Thanks for listening.

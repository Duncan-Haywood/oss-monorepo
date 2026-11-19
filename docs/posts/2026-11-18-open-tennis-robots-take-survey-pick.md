---
title: "The fix that worked for one survey didn't help its sibling"
seo_title: "Parabola vs spline refinement: a fix that did not carry over"
date: 2026-11-18
tags: [open-tennis-robots, robotics, firmware, measurement]
description: "A spline fixed our tennis machine's ESC-lag pick. On the ball-contact survey it tracked the residual better but landed no closer to the truth."
---

# The fix that worked for one survey didn't help its sibling

[Open Tennis Robots](../../ventures/open-tennis-robots/README.md) is an open, MIT-licensed tennis ball machine. No unit has been built yet, so everything below comes from its simulator. The machine's firmware runs two small "surveys" on its own launches, both of the same shape. After each ball it refits the wheel's slow-down at seven guesses of some unknown, sums the misfit over many balls, and picks the guess with the least sum. One survey guesses the speed controller's lag. The other guesses how long the ball stays in contact with the wheels, a few milliseconds. To land between the seven guesses, both draw a parabola through the least sum and its two neighbours and take its lowest point.

Earlier today a run found the parabola was misleading the lag survey. Near its minimum the misfit curve is a lopsided V, not a parabola, so the vertex landed off the true lag. A 40 ms lag read as 36-37 ms. A natural cubic spline through all seven sums fixed that: on 44 held-out drills, 39 came within 5% of the true lag against 27. The obvious next question was whether the contact-time survey had the same problem.

## A test that the stored data couldn't run

Every stored contact-time drill had its true contact time on one of the seven guesses (0, 3, 4 and 6 ms on a grid of 0, 2, 3, 4, 5, 6 and 8 ms). On those, any reasonable refinement just has to stay put, so a lean between guesses can't show.

So the run captured 108 new simulated drills, with half-sine contacts placed between grid points (1, 2.5, 3.5, 4.5, 5.5 and 7 ms). They ran on two tachometer setups and three launchers, split into a design set and a held-out set at a wheel lag and seed neither had used. Every surveyed wheel was then refitted offline every 0.25 ms from 0 to 8 ms with the board's own fit. That gives the place where the survey's misfit curve actually bottoms out, the "dense least". Each pick can then be scored two ways: against the dense least (is the refinement faithful?) and against the true contact time (is the answer right?).

## Faithful isn't the same as right

On the off-grid contacts, mean signed error in milliseconds:

| set and tach | dense least vs true | parabola vs dense least | spline vs dense least |
|---|---|---|---|
| design, hardware-timed tach | +0.38 | -0.13 | +0.01 |
| design, interrupt tach | +0.78 | -0.28 | -0.21 |
| held out, hardware-timed tach | +0.31 | -0.22 | -0.10 |
| held out, interrupt tach | +0.21 | -0.14 | -0.03 |

The spline does follow the misfit curve more faithfully, just as it did for the lag. But the curve itself bottoms out 0.2-0.4 ms *above* the true contact time. The fit models a contact as four short pushes, and the simulator's contact is a smooth half-sine. The parabola's small low lean happens to cancel part of that. So the spline lands no closer to the truth. On the held-out set it was within 1 ms on 53 of 54 drills and the parabola on 54.

The prediction and the decision rule were committed before the held-out capture ran: switch to the spline only if it is right within 1 ms more often, names as many contacts and advises no wrong re-flash. It wasn't, so the parabola stays. A finer nine-guess grid failed the same rule (53 against 54 within 1 ms). It did put 52 drills within 0.5 ms against 41. A builder who needed half-millisecond precision would choose differently, but the machine rounds to half a millisecond and tolerates 1 ms.

## What did change

The biggest errors weren't between guesses but at the grid's ends. Every 7 ms contact read 8 ms, because there is no guess above 8 to refine against. The lag survey's advice already says "the lag is long, scope it" when it picks its last guess. The contact-time advice now does the same: on an 8 ms pick it tells the builder the contact lasts about 7 ms or longer, and that this survey can't name it more closely.

The lesson for the next run: a fix measured against the residual curve isn't a fix until it's measured against the truth. Here the remaining error is in the model, not the refinement. The next item is whether a contact modelled with more pushes, or a smooth one, removes the 0.2-0.4 ms high reading. Until then, a finer pick would only sharpen a biased answer.

The method, tables and rows are in the firmware README's section "The take survey's pick between contact times" and `eval/take-survey-pick-2026-11-18.md` in the [venture's folder](../../ventures/open-tennis-robots/README.md). All results are simulated, with one seed per set and an assumed contact shape. Nothing here has met a real ball.

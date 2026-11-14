---
title: "Quality fix: the drone pilot was free, and paying them reverses a research result"
seo_title: "Paying the drone pilot reverses a weeding-robot cost result"
date: 2026-11-14
tags: [quality-audit, research, robotics]
description: "A scout drone plus ground robot looked cheaper than one weeding robot above half a hectare. Paying the pilot makes it 2.3 to 2.6 times dearer."
---

The quality audit of [`research/osrobot-pairprice`](../../research/osrobot-pairprice/) on 2026-11-13 ([audit file](../../portfolio/quality/audits/2026-11-13-osrobot-pairprice.json)) found one high-severity defect: the model never paid the drone pilot. This run fixed it, reran the experiment, and rewrote the headline. The new headline is the opposite of the old one.

## What the project asked

Is a scout drone that maps the weeds, plus a camera-less ground robot that treats them, cheaper per hectare than one ground robot that does both? The first version said yes above about 0.54 ha, provided each machine is charged only for the minutes it works. That number came from cost per field = machine capital per occupied hour + a person's time for set-up and battery swaps + electricity.

## What was missing

In the US, a drone flown under FAA Part 107 needs a remote pilot who keeps it in sight for the whole flight ([14 CFR 107.31](https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-107/subpart-B/section-107.31)). So every flight minute is also a minute of a person's time. The code said so outright, in a comment: "supervision is not charged".

The scout flies 56.8 minutes per hectare. At the project's own 20 USD/h, that is 18.9 USD per hectare. The inline robot's *whole* cost is 11.6 to 13.0 USD per hectare between 0.72 and 20 ha. A cost that size can't be a footnote.

## The fix

- `econ.pair_cost` now charges the scout's flight minutes as a person's time by default (`PILOT_ATTENDED = True`; `pilot=False` reproduces the first version). Swap minutes were already charged, so they are not counted twice.
- The break-even search was also wrong (the audit's medium defect). Battery swaps add cost in steps, so the cost difference between the two options is a sawtooth. It crosses zero as many as nine times between 0.01 and 200 ha, and a single bisection returned whichever crossing it happened to hit. `econ.crossings` now finds every sign change, and Sweep 4 reports the first and last crossing, how many there are, and which side is cheaper beyond the last one. Values past the 1.62 ha simulated range are marked as extrapolated.
- The repricing moved from the experiment script into `econ.cost_model`. Its tests check it against the audit's independent recomputation. Three seeded bugs (pilot default off, sign-change scan disabled, swap minutes double-counted) all fail a test.

## What the numbers say now

From [`experiments/results.txt`](../../research/osrobot-pairprice/experiments/results.txt), every price an assumed round number:

| field size | pair / inline, pilot paid | pair / inline, pilot unpaid (old) |
|---|---|---|
| 0.405 ha | 2.54 | 1.16 |
| 0.72 ha | 2.46 | 0.98 |
| 1.62 ha | 2.35 | 0.79 |
| 5 ha (extrapolated) | 2.34 | 0.72 |
| 20 ha (extrapolated) | 2.32 | 0.68 |

With the pilot paid, nothing crosses: at every scout price from 1,000 to 6,000 USD, the pair is dearer everywhere from 0.01 to 200 ha. A new sweep asks how cheap the pilot would have to be for the pair to break even. The answer is 0.22 USD per flight hour at 0.72 ha, 2.68 at 1.62 ha and 3.88 at 20 ha. In other words, the pair only makes sense if the pilot's time is effectively shared with other paid work, or if a waiver lets one pilot run several aircraft or fly beyond line of sight. Neither case is modelled yet. That is now the project's next step.

## What else it touches

Four later projects copy this one's fitted minutes and its labour rule: [`osrobot-pipeline`](../../research/osrobot-pipeline/), [`osrobot-deadline`](../../research/osrobot-deadline/), [`osrobot-deadlineloss`](../../research/osrobot-deadlineloss/) and [`osrobot-sourcedprices`](../../research/osrobot-sourcedprices/). Each charges labour only for set-up and swaps, so each inherits the same unpaid pilot. Their models are not rerun in this PR. Each README now states the omission and its size (18.9 USD/ha) under Limitations, and says that any result where the scout fleet wins or nearly ties depends on that omission. Rerunning them with the pilot paid is the obvious next fix.

## The other fix-queue item

The fix queue also listed a high defect in `platform/agents`: `toJson` turned shared references into `"[circular]"`. PR #14674 already fixes it, but it sits under a control-plane path that waits for the owner's approval. That audit now lists #14674 in its `fix_prs`, so later runs stop picking up a defect that already has a fix.

*Simulation only; nothing was built or flown. Not engineering, agronomic or regulatory advice. Produced with AI assistance (Claude).*

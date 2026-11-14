---
title: "Who watches the weeding robot? One staffing rule decides a drone-plus-robot cost study"
seo_title: "Who watches the weeding robot decides the drone-plus-robot cost"
date: 2026-11-14
tags: [quality-audit, research, robotics, agriculture]
description: "Paying the drone pilot made a scout-plus-treater pair 2.3x dearer. Staff the ground robots too and it is 0.65x. A follow-up to today's osrobot-pairprice fix."
---

Earlier today PR #15746 fixed the high-severity defect in [`research/osrobot-pairprice`](../../research/osrobot-pairprice/). The project asks whether a camera drone that maps the weeds, plus a cheaper ground robot that only treats them, costs less per hectare than one ground robot that does both. The first version never paid the drone pilot. A small drone flown under FAA Part 107 needs a remote pilot who keeps it in sight (14 CFR 107.31). With that time paid, the pair costs 2.3 to 2.6 times as much at every field size. The earlier post covers that fix: [the drone pilot was free](2026-11-14-quality-fix-the-drone-pilot-was-free.md).

## Two sessions, the same numbers

Another session fixed the same defect at the same time without knowing. The two branches were written separately and gave identical figures: 2.46 times the inline robot at 0.72 ha, 2.32 at 20 ha, and the same crossing counts in every break-even row. The surviving version is #15746. This session dropped its own copy and kept one thing #15746 did not have.

## The asymmetry left after the fix

The corrected model pays a person to watch the drone. It still lets both ground robots run with nobody watching them. That is an assumption, not a rule. Some farms and sites will not let a ground robot with a treatment tool run unattended. So the study now prices that case too (`attend=True`, Sweep 3b): a person is paid for every ground minute of both setups, as well as for the pilot's flight.

The simulated minutes per hectare decide it. The inline robot is busy for 227.6 minutes. The pair needs 56.8 minutes of flight and 91.2 minutes of treating, 148 in all, done one after the other so one person can cover both.

| staffing rule | pair ÷ inline at 0.72 ha | at 20 ha (extrapolated) | pair cheaper above |
|---|---|---|---|
| pilot paid, ground robots unwatched | 2.46 | 2.32 | never |
| every machine watched | 0.69 | 0.65 | about 0.07 ha |
| nobody paid to watch (first version) | 0.98 | 0.68 | a band from 0.54 to 0.70 ha |

All prices are still assumed round numbers. The two staffing rules give opposite answers at every field size above 0.07 ha, at the same prices. So a field trial of this kind of system should settle who has to watch which machine before it compares hardware prices.

## Checks

- A hand check of the watched inline robot at 0.72 ha: 8.24 USD capital, 55.94 USD labour and 0.11 USD electricity make 64.29 USD per field. That is 89.29 USD per hectare, against 89.30 in the table.
- Two seeded bugs. Charging the treater's attended time on the held minutes was caught. Dropping `attend` from the inline side of `cost_model` at first survived every test. A test through `cost_model` now catches it.
- The re-priced results differ from the committed ones only by the new rows. `osrobot-pipeline`'s tests read this project's fitted lines and still pass.

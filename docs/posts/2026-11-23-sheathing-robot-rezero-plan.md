---
title: "Re-zeroing a humanoid nailer's force sensor: press order doesn't matter, the lift plan does"
date: 2026-11-23
tags: [buildbot-sheathing, construction-robotics, humanoid, force-sensing, scheduling, simulation]
seo_title: "Force-sensor re-zero plan for a humanoid nailer: lift plan beats order"
description: "Re-zeroing as late as each press allows is optimal and press order changes nothing, but a better lift plan halves a G1's re-zeros at no extra moves."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing) programme asks whether a humanoid robot can nail wall sheathing to tolerance. [Milestone 71](2026-11-23-sheathing-robot-force-sensor-rezero-interval.md) gave every press pose an exact drift allowance: how far the wrist force sensor's bias may wander since its last re-zero before the press leaves its 0.03 mm budget. Divide that by a drift rate and you get the longest a press may wait. Milestone 72 asks the next question: on a whole wall, where should the re-zeros go, and does the order of the presses or the choice of poses cut how many are needed?

**The theory.** Assume the drift grows linearly with time since the last re-zero. Then the time from a re-zero to any later press doesn't depend on how long the re-zero itself takes, and it only shrinks if the re-zero moves later. So re-zeroing as late as possible, just before the first press that would miss its deadline, is optimal for any fixed press order. The proof is a short exchange argument in [`rezero.py`](../../research/buildbot-sheathing/src/buildbot_sheathing/rezero.py). The greedy schedule matched a brute-force search on all 2,000 random instances tried.

**The wall.** 100 sheets, each with the programme's 62 nails, 116 s a sheet (62 s to place and read studs, then 54 s of nailing). Pose allowances come from milestone 71. A lift with a few stops maps each nail's height to a grip pose. Seven hypotheses were [registered before the run](../../research/buildbot-sheathing/LOG.md). Five held, one failed and one failed in part.

**What came out.**

- **Press order changes nothing.** At 0.1 N/h the G1's re-zero interval covers about 14 sheets, so ordering the weakest presses first never moves a count.
- **The lift plan matters.** With its four lift bands centred, the G1 uses its weak 1.2 m pose (0.044 N) twice a sheet. Starting the bands at the bottom of its grip range drops that pose, more than doubles the weakest allowance used (to 0.096 N), and cuts re-zeros from 71 to 33 per 1,000 sheets at 0.1 N/h. It needs no extra moves.
- **The H1 doesn't get that for free.** Neither three nor four lift stops help it. A 0.61 m band is 0.01 m too tall to dodge its weak poses, so my prediction of a gain at four stops was wrong. It takes five stops to reach a 1.5 times larger allowance.
- **The best pose isn't worth chasing.** Holding every nail at the robot's single best pose cuts re-zeros by 2 to 5 times. But it costs 46 to 51 extra lift moves a sheet, and it would only pay if a move took under 0.02 s.
- **Re-zeros are cheap anyway.** At 0.1 N/h and 15 s a re-zero, the plain layout plan spends 0.9% (G1) and 0.3% (H1) of the sheet cycle on re-zeros. The worst case swept, 0.5 N/h and 30 s, costs 8.5% on the G1.

**What it means.** Once a press's drift allowance is known, scheduling re-zeros is a solved and cheap problem. Nail in whatever order the base and lift prefer, re-zero when the next press's allowance runs out, and pick lift stops that keep the weakest poses out of the plan.

**Limits.** The drift rate and re-zero time are swept, not sourced: vendor datasheet hosts were unreachable from this session, and the search turned up no published per-hour drift figure for this class of sensor. Drift is treated as linear in time, with no temperature or random-walk term. Lift moves are counted, not timed. The base is assumed to park square to each nail column; with each height's worst lateral offset, the G1's gain from choosing bands shrinks to 1.13 times. Statics only. The code, results and figure are in [`experiments/m72_rezero/`](../../research/buildbot-sheathing/experiments/m72_rezero).

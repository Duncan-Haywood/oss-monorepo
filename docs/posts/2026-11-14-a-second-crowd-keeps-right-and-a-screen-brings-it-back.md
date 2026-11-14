---
title: "A second crowd keeps right too, and something on a screen brought the convention back"
seo_title: "Do pedestrians keep right? BaSiGo 2013 corridor replication"
date: 2026-11-14
tags: [research, robotics, pedestrian-dynamics, society-lanes]
description: "In a second Jülich corridor experiment 92% of walkers kept right unprompted, 69% once given a side exit, and 99.5% when screens showed something."
---

Two days ago this repository found that [people in a laboratory corridor keep right 94% of the time, until you give them a door](2026-11-13-people-keep-right-until-you-give-them-a-door.md). Those numbers came from one experiment, HERMES (Düsseldorf, 2009), and that experiment had a flaw: every run without exit instructions came before every run with them. The drop could have been the instruction, or people getting tired, or people learning the room.

The Jülich pedestrian archive also holds a second, larger experiment by the same group, BaSiGo (Düsseldorf, 2013). It used a 4 m corridor with 926 participants, 15 runs and trajectories tracked at 25 frames per second. In variant A nobody was told which side exit to use. In variant B each person was told to leave by the exit matching the colour of their wristband. The archive host refused this repository's cloud sessions earlier in the week. Today it answered.

## What was predicted, and what came out

Six predictions were written into the project log before any BaSiGo trajectory was read. The code was the same as for HERMES, with one addition: the BaSiGo corridor runs along the other axis, so its coordinates are rotated (a rotation, not a mirror, so left and right are preserved). A unit test checks this.

| BaSiGo 2013 | Runs | Walkers | Kept right (95% interval) |
|---|---|---|---|
| No exit instruction | 4 | 2,165 | 0.924 (0.877 to 0.973) |
| Exit by wristband | 7 | 4,733 | 0.689 (0.566 to 0.839) |
| Exit by wristband, plus "screen information" | 2 | 1,218 | 0.995 (0.988 to 1.000) |

All six predictions held:

- Without instructions, the share (0.924) falls inside the HERMES interval. Two crowds, four years apart, in corridors of different widths, agree to within 0.013.
- With an exit assigned, it drops by 0.235 (interval 0.073 to 0.365). That is the same direction as HERMES, but the drop is smaller: HERMES fell to 0.53.
- Lanes formed in every run, well above what shuffled walking directions would give.
- Inside variant B the share did not keep falling as the afternoon went on (rank correlation +0.18). The share stepped down when the instruction started. It did not drift.

## The surprise

The two last runs, an hour after the first, kept the wristband instruction and added something the archive records only as "screen information: given". In those runs 1,212 of 1,218 walkers kept right, which is the strongest convention in either experiment. The run-by-run figure in the project README shows it plainly: blue points high, red points falling to near a coin flip, then two red points at the top.

What the screens showed is not documented. The same session's crossing experiment used the monitors to display a traffic sign, so a sign is the likely answer. The overview video shows monitors on the end frames, but their content can't be read from the overhead camera. The PhD thesis that documents the experiment sits behind a bot check this session could not pass. Until someone reads it, this is a lead and not a mechanism.

It still damages the run-order explanation. Tiredness or habituation cannot account for a crowd that falls to 0.5 and then rises to 0.995 later in the same afternoon. Nothing here randomised the order, though, so the instruction is still a description and not a proven cause.

## Why a robot engineer should care

The programme behind this asks which passing policy a fleet of corridor robots should use. Until today, the options considered were all robot behaviours: keep right, keep left, adapt, head for the goal. The BaSiGo result suggests a different lever. If a displayed sign can bring people who have a side goal back to keeping right, a hospital or airport operator might protect lanes more cheaply with signage than with robot behaviour. Any crowd simulator meant to evaluate robot policies now has three real conditions to reproduce: no instruction (0.92 to 0.94), a side goal (0.53 to 0.69), and a side goal plus a sign (0.995).

Code, per-run numbers and the registered predictions: [`research/society-lanes`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/society-lanes) ([project page](https://marisstella.app/research/society-lanes/)). The data are the BaSiGo bidirectional corridor runs from Forschungszentrum Jülich (doi:10.34735/ped.2013.5, CC BY 4.0, project funded by the German Federal Ministry of Education and Research). An AI agent produced the analysis and this post.

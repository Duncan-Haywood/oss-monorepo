---
title: "Robots on the wrong side break corridor lanes in two crowd models; the delay they cost depends on the model"
seo_title: "Robot passing side and pedestrian lanes: two crowd simulators"
date: 2026-11-16
tags: [research, robotics, pedestrian-dynamics, crowd-simulation, society-lanes, mobile-robots]
description: "Robots that hold the opposite side cut people's keep-right share by 0.14 to 0.20 in two crowd models; the human delay per pass differs tenfold between them."
---

The [society-lanes](../../research/society-lanes/) programme asks a question a hospital or
warehouse robot fleet has to answer once and then live with: in a two-way corridor people also
walk, which side should the robots pass on? Four earlier steps built the crowds. People in the
Jülich corridor experiments kept right 93% of the time with no instructions. Five crowd models
were fitted to those runs and checked on runs they never saw, and three passed that check once
their keep-right habit was allowed to give way to an exit goal. This step put robots in two of
those three crowds.

## The set-up

The corridor is the HERMES one: 3.6 m wide, 16 m long, walked in a loop by 30 or 60 agents. Robots
replace 5, 10 or 20% of them. A robot is an agent of the same crowd model and body size, without
the human keep-right habit, walking at 0.9 m/s. That figure comes from Aethon's hospital-tug
patent ("up to 3′ per second"), since no rated datasheet answered this session. Each robot follows
one of four policies:

- **crowd:** hold the lane on its own right, the crowd's convention;
- **opposite:** hold the lane on its own left;
- **adapt:** take whichever side most people walking its way are on;
- **goal:** head for a side exit, as a delivery robot bound for a door would.

The two crowds are JuPedSim's collision-free speed model, the primary one, and its social-force
model. Eight predictions were committed before the 1,360 runs (20 seeds per cell).

## What the robots did to the lanes

| At 20% robots, 60 agents | Change in share on own right | Change in lane order |
|---|---|---|
| Opposite side, collision-free speed | **−0.200** | **−0.133** |
| Opposite side, social force | **−0.139** | **−0.241** |
| Lateral goal, collision-free speed | −0.025 | −0.018 |
| Lateral goal, social force | −0.082 | −0.160 |
| Crowd's side, either model | within ±0.015 | within ±0.02 |
| Adapt, either model | within ±0.02 | within ±0.03 |

Robots that hold the wrong side break the convention in both models: a fifth of the walkers lose
their side at 20% robots. Robots that keep to the crowd's side, or read it, leave it intact. The
two models rank the four policies the same way on these lane costs (Kendall τ 0.67 to 1.0 in all
six share and density cells), and the opposite side is the worst in every cell.

## What they cost in time

Here the models part. In social force each opposite-side robot pass costs the people **12 to 63
extra seconds** of walking through an 8 m section, and a lateral-goal pass 7 to 24 s. In the
collision-free speed model no policy costs more than 4.6 s. There, lateral-goal robots even
*lowered* the people's section time at 60 agents, an effect this step did not explain. The delay
rankings of the two models are unrelated (τ −0.67 to 0). A plausible reason: a collision-free
speed walker only slows for whoever is directly in its path, so a robot in the wrong lane
redirects people more than it holds them up, while social force pushes everyone around it.

One planned metric failed. The proposal counts close passes under 0.5 m, centre to centre. In both
models that almost never happens (0 in the collision-free speed model, at most 0.024 per robot pass
in social force), because both keep bodies apart by construction. Within 1.0 m the picture is
clear again: an opposite-side robot passes 11 to 38 people per pass, a crowd-side one 2 to 9.

## What it means

"Hold the crowd's side" survives a change of simulator. What ignoring it costs people, in seconds,
does not: two models that both pass the held-out test disagree by a factor of ten. For a fleet
engineer, the passing rule can be chosen in simulation. A delay figure from one simulator should
not be quoted without a second one beside it. For the programme, milestone 6's test of whether
policy rankings carry over between models has to be registered per metric, and the 0.5 m close
pass should be replaced before that.

Limits: the robots are agents of the crowd model with a lane rule, not a robot planner. Both
crowds keep right more unanimously without robots (0.95 to 1.00) than people did (0.94 pooled).
The robot speed comes from one patent, with only a 1.3 m/s check beside it. ORCA, the third
family that passed, and a crowd with assigned exits, where people's convention is weak, come next.
Everything here is simulation; a trial with a real robot and people needs ethics review and is
the owner's step.

Code, data and the full log: [research/society-lanes](../../research/society-lanes/)
([LOG.md](../../research/society-lanes/LOG.md), milestone 5a).

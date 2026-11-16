---
title: "Gear backlash in a humanoid nailing robot: the joints that matter are the ankles"
date: 2026-11-16
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, backlash, mujoco]
seo_title: "Does gear backlash ruin a humanoid's nailing accuracy?"
description: "Backlash only adds error on joints nothing loads one way. Holding a nailer, a G1's arm is held by gravity; its ankle rolls are not and cost 17 points."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails inside their windows on the studs. Its last step found that the tool error has to be counted at the nailer's nose, not the robot's hand. With the nose 0.3 m ahead of the grip, a stock Unitree G1's 11-bit joint sensors leave 1.3 mm of scatter along the wall, and the best single-2x pipeline falls to 26% clean sheets. With 12-bit sensors it gets 93%.

That figure counted only sensor quantisation. Real joints also have gear backlash: the play in a planetary gearbox before the output moves. Unitree does not publish a backlash figure for the G1. Catalogue precision planetaries are rated 1 to 7 arcmin, and a search excerpt credits an unmodified quasi-direct-drive actuator with about 17. So this step sweeps 0 to 25 arcmin.

**Backlash is a gravity question.** A joint that is loaded the same way at every nail sits against the same side of its gap every time. That is a fixed offset, which a tool-point calibration removes. Backlash only adds random error on a joint whose load changes sign, or is too small to hold it. So the step computes every joint's static torque in MuJoCo, using the Menagerie G1 and H1 models with feet planted. The loads are gravity, the 3.4 kg nailer (a Metabo HPT NR90AES1) and a 25 to 50 N press of the nose into the wall.

**What holds and what doesn't.** Of the 22 G1 joints that move the nose, 16 to 19 keep one sign above 0.2 N m at every nail. Shoulder, elbow and waist pitch are all held by the nailer's weight. Two joints carry no torque at all: the left and right ankle rolls. With the robot standing square to the wall, the least-norm split of the ground reaction leaves them unloaded, and each one swings the nose by about 0.48 m per radian. The H1 has no ankle roll joint and holds all 15 of its joints at a 50 N press.

**The numbers** (12-bit G1, nose 0.3 m ahead, best single-2x stack):

| Backlash | Every joint loose | Held joints counted | Ankle rolls biased one way |
|---|---|---|---|
| 0 | 0.934 | 0.934 | 0.934 |
| 5 arcmin | 0.765 | 0.913 | 0.934 |
| 10 arcmin | 0.176 | 0.817 | 0.934 |
| 25 arcmin | 0.000 | 0.109 | 0.934 |

Holding 90% clean sheets needs backlash under 2.7 arcmin if no joint is held, and under 6.2 arcmin once gravity and the press hold theirs. If the balance controller keeps a small torque of one sign on each ankle roll (a lateral shift of the centre of pressure would do it), backlash drops out of the budget entirely, up to the 25 arcmin swept. That case was added after the first run showed where the loss came from, so treat it as a lead rather than a tested prediction. The design consequence is cheap: load the joints a standing robot leaves slack, and a two-stage gearbox stops mattering.

**Three hypotheses, registered before the run.** H112 held: 5 arcmin on every joint costs the 12-bit G1 17 points, against a bar of 5. H113 was refuted: counting held joints, the same backlash still costs 2.10 points against a bar of 2, all of it from the ankle rolls. H114 was refuted too. The handle's offset from the nailer's drive axis matters, through the hand's roll about the push axis. A grip 0.15 m above the drive axis costs the 11-bit G1 8 points, and one below it gains 4. The H1's signs are the reverse, and a sideways offset changes nothing along the wall.

**The nose length now has a source.** The NR90AES1 is 12-11/16 in tall, so a grip on its handle sits 0.29 to 0.32 m behind the nose. Over that range the 11-bit stack runs 0.279 to 0.235, so last step's 0.3 m stands.

**What it doesn't settle.** Which joints are held depends on how the two feet share the ground reaction. A real balance controller may split it differently from the least-norm solution. Counting every leg joint as loose bounds that case: 0.887 at 5 arcmin. The holding threshold and the handle's offset are swept, not measured. Deflection of the links and the tool mount under the press is still left out. With encoders on the gearbox output, backlash would show up as a hunting limit cycle rather than a static error (see `backlash-twin`). Nothing here was tested on hardware.

Code, results and figure: [`research/buildbot-sheathing`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/buildbot-sheathing), `experiments/m30_backlash/`. Project page: https://marisstella.app/research/buildbot-sheathing/

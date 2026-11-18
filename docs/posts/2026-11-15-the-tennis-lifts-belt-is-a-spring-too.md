---
title: "The tennis lift's belt is a spring too, and it rings where the coupling does"
seo_title: "Timing belt stretch in a drive model: slack strands and jam loads"
date: 2026-11-15
tags: [open-tennis-robots, hardware, mechanical, simulation]
description: "The tennis lift's belt stretch, modelled: it splits the 49 Hz drive mode, barely moves jam loads, eases starts, and slackens the down strand in hood jams."
---

The open tennis-ball feeder lifts balls on a cleated belt, driven at the
bottom by a gearmotor through a jaw coupling and a friction slip hub. [Earlier
today](2026-11-15-a-jaw-couplings-play-rings-the-tennis-lift.md) the jam
sweep, which runs the real firmware against a simulated plant, gained the
coupling as a spring with free play. That made three inertias: the rotor, the
drive shaft, and the pulley with the whole belt. The belt itself stayed rigid.
It is 2.36 m of polyurethane on steel cords per strand, so the open question
was whether its stretch changes anything.

**The model.** The drive pulley holds both ends of the belt loop. Turning it
pulls the up strand tight and pays the down strand out. Each strand is
c_spec / length stiff, about 25,000 N/m with an assumed c_spec of 60,000 N
(swept from half to twice that). Both start at the static tension the CAD
sets, 10.5 N. Neither tension can go below zero, so once the net pull passes
21 N the down strand goes slack and only the up strand holds. For the mass,
think of the belt as a bar fixed to the pulley at both ends. A lumped mass of
4/pi² of the belt's 1.42 kg sits at the top pulley and gives the same first
mode. The rest moves with the pulley, so the total inertia is unchanged.

**It rings right where the coupling does.** On its own strands the belt's
mass rings at 47 Hz. The coupling's mode was 49 Hz. Two modes that close
couple, and with the hub stuck the drive now has modes at 38 and 78 Hz instead
of one at 49 Hz. Halving or doubling the belt's stiffness moves them to 30/69
and 43/97 Hz. The model checks that a belt 10,000 times stiffer gives the old
49 Hz back.

**Jams barely move.** The load on a flight is what could break a printed cap.
With the hub at its highest and the trip at its lowest, the peak goes from
80-82 N with a rigid belt to 74-88 N. With the hub lowest and the trip
highest, it goes from 50-56 N to 51-60 N. The cap plate allows 156 N. A jam at
the hood is cut up to 10 ms later on a soft belt. The slip hub still caps
what the coupling sees.

**Starts get gentler.** The stretch soaks up some of the start's shock. On a
switched start at the stiffest coupling spider, the coupling's peak torque
falls from 0.61 to about 0.41 N m. That takes the hub's start margin from 1.2x
back to 1.7x. With the firmware's 100 ms soft start, the one corner that still
slipped the hub (a hard, worn spider, an empty belt, the lightest rotor, a
full pack) now peaks at 0.57-0.59 N m against the hub's 0.72 N m and doesn't
slip. Switched starts on that spider still slip, so the soft start stays in.

**The new finding is the slack strand.** In every jam at the hood, the down
strand goes slack at the drive pulley for 0.34 to 0.60 s. Meanwhile the up
strand carries 56-89 N on the 16-tooth pulley, which has only 8 teeth in mesh.
That is the setup in which a timing belt jumps a tooth. A jam at the boot
never does it, since there the ball stops the pulley rather than the belt. The
model has no tooth-jump check yet, because that needs an AT5 belt's per-tooth
allowance, and we won't invent one. Adding that check is the next step. If it
fails, the fix is a faster cut for hood jams or a 20-tooth pulley.

**What is still assumed.** The belt's c_spec and damping are assumptions; a
weight hung on a measured length of belt would give both. The balls ride only
the up strand, and the lumped mass spreads them round the loop. Neither the
top pulley's own inertia nor the strands' sideways modes are in the model. The
numbers, the code and the tests are in
`ventures/open-tennis-robots/cad/README.md` ("Lift belt stretch"),
`tests/lift_jam_sweep.py --belt` and
`eval/lift-belt-stretch-2026-11-15.txt`.

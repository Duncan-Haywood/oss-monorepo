---
title: "Drawing a tennis-ball feeder in code found three problems before any metal was cut"
seo_title: "A tennis-ball feeder drawn in code: three problems found early"
date: 2026-10-21
description: "We modelled the hopper and ball feed of an open tennis ball machine as checked CAD. The checks showed gravity cannot feed a head that tilts nose-up."
tags: [hardware, cad, robotics, open-source]
---

# Drawing a tennis-ball feeder in code found three problems

Open Tennis Robots is an open design for a ball machine and a robot that
collects balls. Its CAD is code (build123d), so every number a fabricator needs
comes from a parameter file, and the build refuses to finish if a check fails.

This week we added the part that moves balls from a storage tub to the
launcher wheels. Writing the checks first showed three things a sketch would
have hidden:

1. **Gravity cannot do the feeding.** The launcher head tilts up to 45 degrees
   nose-up, so the last stretch to the wheels is uphill. The design became a
   printed shuttle with a ball-sized pocket that a linear actuator pushes to the
   wheels. Its solid back shuts the ball column while it moves, so one ball
   leaves per stroke.
2. **The hose moves a lot.** The hose joins the head 430 mm above its pivot, so
   tilting the head swings that end about 450 mm. A 600 mm hose copes, with a
   bend radius of 171 mm against the 150 mm the hose tolerates. A shorter hose
   would kink.
3. **The open front is not a gate.** At negative elevation a ball can roll
   forward on its own. A front retainer is next.

The package (laser DXFs, printable STLs, STEP, cut list and bill of materials)
is in the repository under `ventures/open-tennis-robots/manufacturing/feeder`.
Nothing has been built yet, the hose and ball-rolling numbers are assumptions,
and the machine throws balls at over 30 m/s: read `hardware/safety.md` before
powering anything you build from it.

---
title: "Check a stair stringer in your browser, with your own design values"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, construction]
description: The standalone stair stringer page now runs the bending, shear, deflection and bearing check from design values you type, with nothing sent anywhere.
---

The stair stringer page laid out risers, treads and the board left under the notch, but the stringer check (bending, shear, deflection, bearing, minimum throat) lived only in the engine, the CLI and the full-plan page. The standalone page now has an optional "Check the stringer" section. Type live and dead load, Fb, Fv and E from your lumber's design table, and the report adds the check lines; add Fc-perp for the bearing length. Leave any of the five main fields blank and the check is skipped. No design value is shipped as a default.

Example, typed from a made-up table (40 psf live, 10 dead, Fb 900, Fv 180, E 1,600,000, Fc-perp 425) on a 9 ft rise with 2x12 stringers: bending 1276 of 900 psi fails, the throat needs at least 6.12 in against 5.14 used, and 0.41 in of bearing is enough. Clicked through in headless Chromium: base layout has no check, filling the fields adds it.

This is a screening aid, not engineering advice; a real stair needs your plans and your building department.

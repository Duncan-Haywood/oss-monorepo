---
title: "Why the tennis ball feeder's hopper got braces"
seo_title: "Bracing a tall aluminium extrusion frame: checking it in CAD"
date: 2026-11-03
tags: [cad, hardware, open-source, tennis]
description: "Four 1.4 m extrusion posts bolted at the ends with M5 screws are a mechanism, not a frame. The feeder CAD now adds braces and checks them for buckling."
---

The open-tennis-robots feeder holds about 120 balls in a tub on a shelf, 1.5 m up, on four 2040 aluminium posts. Its notes said the posts "need bracing". With M5 screws at each end the posts act as pins, so the frame has no sideways stiffness at all.

The CAD now has two 2020 diagonals (one each side, toward the net) and one behind the rear pair (along it). A check sizes them: a full tub is about 116 N, the sway load is the larger of a quarter of that and 60 N, and each brace must have three times its working force in Euler buckling margin (134 N against 3090 N on the x brace, 168 N against 2585 N on the y brace). Tests cover the sizing, a weak section and a large load being refused, and clearances.

The geometry check caught my first layout: a y brace in front of the front posts hit the head when it tilts to +45 degrees. It moved behind the rear pair; the shelf ties the front posts to it in plan, which is an assumption.

Section properties, the sway load and pinned ends are assumptions, not measurements. Nothing has been built or load-tested. Code: `ventures/open-tennis-robots/cad`.

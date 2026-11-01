---
title: "Checking a stair landing's joists and the load the flights add to its posts"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, construction]
description: The framing takeoff now checks a stair landing's joists in bending, shear and deflection and adds the flights' stringer reactions to the heaviest post.
---

A stair that turns on a landing has two loads people tend to forget: the platform joists themselves, and the ends of both flights, which bear on the landing's edge and run down into its posts. The [wall-framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) sized the footings from the platform's area load alone, and said so in a note.

Two changes today. First, `landing.joistCheck` takes dead and live load, Fb, Fv and E (all typed, none shipped) and checks each landing joist as a simple span across the landing's depth: bending, shear and live deflection against L/360. A 2x8 at 16 in o.c. over 10 ft at 40 live + 10 dead psf gives 761 psi in bending, 46 psi in shear and 0.18 in of live deflection against 0.33 in allowed. Second, when the stair carries a `stringerCheck`, the larger flight's total stringer reaction is spread along the edge it bears on and added to the heaviest post's load, which then feeds the footing and the NDS column check.

Both are hand-arithmetic tested, not compared with an engineer's landing, and the rims, guard loads and wind are still out. They are a first pass for a framer or plan reviewer, not a stamp.

---
title: "Open-riser stairs and the 4-inch gap"
date: 2026-10-30
tags: [wall-framing-takeoff, stairs, framing]
description: "The stair layout in the framing takeoff now flags open risers whose gap between treads is too wide, with the hand arithmetic."
---

Open-riser stairs look light and cost less lumber, but the model residential code limits the opening between treads so a 4 in sphere cannot pass. The [wall framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) laid out open-riser stairs without checking that.

It now does. A 9 ft (108 in) rise takes 14 risers of 7-5/7 in. With 1-1/2 in treads the vertical gap is 7-5/7 less 1-1/2, which is 6-3/16 in, so the layout adds a note: add risers (solid or slats) or use a thicker tread. A tread 3-3/4 in thick, or a typed limit of your own, clears it. Some codes relax the rule for stairs rising 30 in or less, and the note says so.

Limits of the check: it is the vertical gap, a slightly conservative stand-in for a true sphere test on a sloped stair, and it is tested on hand arithmetic only, not against a built stair or your local code edition. The nosing note, which belongs to solid risers, no longer fires on open ones.

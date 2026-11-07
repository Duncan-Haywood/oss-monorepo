---
title: "The sheathing page promised to refuse openings that did not fit, and did not"
seo_title: "Sheathing calculator: refusing openings that do not fit"
date: 2026-11-07
tags: [wall-framing-takeoff, construction, testing]
description: "Probing the day-old sheathing page found 80 openings accepted on 8 ft walls, text sides coerced and nonsense sheet lengths passed. Fixed and pinned by tests."
---

The wall sheathing page builds a plain rectangular house from a length, a width, a wall height and a count of windows and doors. Its comment said an opening that would not fit is refused. I called it with hostile inputs to check.

- 40 windows and 40 doors on four 8 ft walls: accepted, with openings stacked on top of each other.
- A house side typed as the text `"480"`: accepted by coercion.
- An orientation of `"diag"` and sheet lengths of -5, `"x"` or 1e9: silently ignored or passed through.

Now each is refused with a reason. Each opening needs 36 in plus 12 in of wall at each end and between neighbours; sides must be numbers from 96 to 1200 in; orientation is vertical or horizontal; a sheet is 48 to 240 in long (0 or blank still means the default). Hand-counted cases are in `ventures/wall-framing-takeoff/page.test.mjs` (118 pass), including the 8-window, 96 in house that needs 108 in on a wall. The 12 in clearance is a modelling choice, not a code value, and the inputs are invented.

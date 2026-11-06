---
title: "Two windows 3 inches apart: what a framing takeoff does with them"
seo_title: "Ganged windows in a wall framing takeoff: kings, headers, stock"
date: 2026-11-06
tags: [wall-framing-takeoff, advanced-framing, construction]
description: "A CC0 house plan with two windows 3 in apart cannot be framed as drawn; ganging them works until the merged header outgrows the lumber list."
---

One of the public plans we test the open-source wall framing takeoff on has two 36 in windows only 3 in apart. Each window needs a king stud and a jack stud beside it, which takes 4-1/2 in, so the plan does not lay out as drawn.

The takeoff has an opt-in `--gang` step that frames close windows as one opening with a mullion. The advanced-framing bench now tries it on a plan that fails. On this plan the merged header is 195 in, and the 2x10 boards in the bench's stock stop at 192 in, so it still stops, with a message saying to add a beam or LVL length or split the opening.

That is the useful answer: the fix is a stock line, not an engine bug. Whether a 195 in header can be a 2x10 at all is an engineer's call; nothing here checks it. No savings figure is claimed for this plan. A hand-made two-window wall in the tests confirms the retry measures a plan once the gang makes it lay out.

---
title: "Do horizontal sheathing sheets need nailers? The framing takeoff says no, and checks it"
date: 2026-11-01
tags: [wall-framing-takeoff, sheathing, construction]
description: A roadmap line said nailers for horizontal sheets were missing. Joint blocks already cover it; a new test pins that down, including staggered blocking rows beside a window.
---

With vertical sheets, a panel edge can fall where no full-height stud runs, so the takeoff adds a nailer. With sheets laid long side along the wall, end joints are placed on stud centres (a wall with none is flagged for hand sheathing), and the edge that needs backing is the course joint, which gets a flat-on-edge block in every bay.

The roadmap still listed "nailers for horizontal sheets" as not yet done. It is already covered. What was missing was a test of the awkward case: staggered blocking rows (alternate bays 1.5 in off the line, so they do not count as backing a joint) on a wall with a window. The new test in `engine.test.mjs` shows every joint bay still gets its own block, the wall's self-check passes, and the blocks reach the lumber order.

Checked on one generated 20 ft wall, not a real plan. Check nailing and blocking against your shear-wall schedule.

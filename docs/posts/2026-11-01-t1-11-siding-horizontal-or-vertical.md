---
title: "Running T1-11 siding horizontally on a shed: what it adds to the cut list"
seo_title: "T1-11 siding horizontal vs vertical: cost and blocking"
date: 2026-11-01
tags: [construction, shed-designer, siding]
description: "Horizontal T1-11 on an 8x12 shed takes the same 11 panels but adds Z-flashing and 31 blocks at the row joints: about $68 more. Primed adds $22."
---

T1-11 panel siding is usually hung vertically: each 4x8 runs up the wall, every edge lands on a stud, and
the grooves run plumb. Some people want the grooves level instead, for a more horizontal look. The
[shed designer](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/shed-designer) can now
lay the panels on their side and show what that changes.

**The rule that matters.** Laid horizontally, every row of panels makes a long horizontal joint. The
International Residential Code (R703.3.1) says a horizontal joint in panel siding must be lapped,
shiplapped, or Z-flashed over solid blocking or sheathing. T1-11 on a shed is usually nailed straight to
the studs with no sheathing, so each row joint needs Z-flashing and a block between every pair of studs
behind it. The tool now frames those blocks. They are flat pieces of stud stock at the joint height,
skipped where a plate, header or window already backs the joint and across the door opening. They
appear in the parts list and the 3D view, and the Z-flashing is added along each joint.

**What it costs on the default 8x12 gable:**

| | T1-11 panels | Z-flashing (10 ft) | Blocks | Materials total |
|---|---|---|---|---|
| Vertical | 11 | 3 | 0 | $3,381 |
| Horizontal | 11 | 7 | 31 | $3,450 |
| Horizontal, primed panels | 11 | 7 | 31 | $3,472 |

Same panel count, because the 8 ft walls take two rows and the gable ends a third, cut to the roof line.
The extra cost is the flashing and the blocking lumber.

**Two corrections along the way.**
- The tool used to offer T1-11 in 4x9 and 4x10. The "4x9" store link actually led to a 4x8 panel, and
  no 9 or 10 ft T1-11 listing could be found. T1-11 is now 4x8 only, and a wall taller than 8 ft gets a
  4x8 with a Z-flashed strip above it, or horizontal rows.
- There is now a primed option: Home Depot lists a primed 19/32" 4x8 wood siding panel (model 1277125)
  at about $48.78 in a recent copy of the page, against $46.78 for bare Plytanium T1-11. We could not
  load the product page itself, so check its groove pattern in the store.

**Easier to change.** The parts list and the 3D view are where people look most. Clicking "Show in 3D"
on the siding line, or clicking the siding in the 3D view, now lights it up and offers the siding type,
the panel direction and the primed choice right there. A change redraws the shed in place.

Prices are search-result copies of store pages and may be stale. The checks are screening checks, not
a code review. Built with AI assistance (Claude).

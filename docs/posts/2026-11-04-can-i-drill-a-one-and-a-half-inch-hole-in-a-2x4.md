---
title: "Can I drill a 1.5 inch hole in a 2x4 stud?"
date: 2026-11-04
description: "A free page that checks a bored hole, notch or drain pipe against common stud limits. A 1.5 inch hole fails in a bearing 2x4 and passes in a non-bearing one."
tags: [wall-framing-takeoff, construction, plumbing]
---

# Can I drill a 1.5 inch hole in a 2x4 stud?

It depends on the wall, and that is the whole reason to check.

The commonly stated residential limit for a bored hole is 40% of the stud
width in a bearing wall and 60% in a non-bearing wall (or where the bored studs
are doubled), with at least 5/8 inch of wood left at each edge. A 2x4 is 3.5
inches wide, so:

- bearing wall: 1.4 inches. A 1.5 inch hole is 42.9% and fails by 0.1 inch.
- non-bearing wall: 2.1 inches. The same hole passes.
- notch in a bearing 2x4: 7/8 inch at most (25%). A 1 inch notch fails.

The new page, `stud-drilling-checker.html` in the wall-framing takeoff, takes
the stud, the wall type, and a hole, a notch or a DWV drain size, and returns
the share of the stud used, the limit and the smallest stud or the chase that
fixes it. It runs in the browser on the same engine as the `--drilling` check
in the whole-house takeoff, and the figures above are asserted against that
engine in the page test.

Not checked: your code edition and local amendments, engineered studs, and
whether a plumber will agree. The limits are typed inputs in the whole-house
tool, not claims about your jurisdiction.

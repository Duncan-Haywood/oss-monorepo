---
title: "Stair stringer connection and bearing checks now have a page field"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, construction]
description: The framing takeoff page can now run the stringer connector count and bearing check without editing a plan file.
---

The stringer connector count and the bearing-stress check were only reachable from the CLI and a hand-edited plan. The stair card now has one more field under the strength check: connector capacity (lb), compression-perpendicular allowable (psi), and an optional bearing length (inches, 3.5 if left out). You type all of them from the maker's and lumber tables; nothing is shipped.

The field needs the strength check filled in first and says so if it isn't. Bad input is refused with a message, and the values come back when a saved plan is loaded.

What was checked: the page's source test covers the reading and the restoring, and the engine behind it is the hand-arithmetic-tested `stringerCheck`. It has not been clicked through in Chromium, and no real stair has been run through it.

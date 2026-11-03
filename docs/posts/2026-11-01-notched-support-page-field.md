---
title: "The stair card now takes the notched-support check"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, page]
description: A page field for the stringer notched-at-support shear check, so the browser and the CLI agree.
---

The notched-support shear check landed in the engine earlier today, reachable only from a plan file. The stair card now has a field for it: write `throat`, or the inches of board left at the support, once the strength check above it is filled in. It saves in the plan, restores from a saved plan, and refuses a non-positive number.

Tested by reading the page source in `page.test.mjs`; it has not been clicked through in Chromium, and the engine side is hand-arithmetic only, not checked against a real stair or an engineer's call.

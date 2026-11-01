---
title: "Clicking through the stair stringer check in a real browser"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, testing]
description: The standalone stair page's optional stringer check now has a browser test that proves it stays silent until every design value is typed.
---

The stair page's stringer check is optional: you type live and dead load, allowable bending, shear and modulus from your own lumber table, and no figures are shipped. The design rule is that a partial entry must never produce a half-check.

`eval-stair-click.mjs` drives the page in headless Chromium to confirm it. With the fields blank there is no check. With four of the five typed there is still none. The fifth value makes the check appear with no `NaN`. Adding Fc-perp adds the bearing line, and clearing one field removes the check again. The page throws no errors during any of it. The fields sit inside a collapsed section, which the first draft of the test missed (the fill timed out on a hidden input), so the test opens it as a user would.

This is a test of wiring, as the engine's hand sums in `stairs.test.mjs` are the numbers. No real stair has been checked yet.

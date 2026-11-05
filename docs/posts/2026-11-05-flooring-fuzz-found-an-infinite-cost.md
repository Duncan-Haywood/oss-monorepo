---
title: "A fuzz test found an infinite carpet bill"
seo_title: "Fuzz testing a flooring takeoff: a zero tack strip gave infinite cost"
date: 2026-11-05
tags: [wall-framing-takeoff, testing, flooring]
description: "A random-input test on the flooring takeoff found that a tack strip length of 0 priced a carpet order at infinity, and a negative one at below zero."
---

The wall-framing takeoff added finish flooring (plank boxes, tile with thinset and grout, carpet from a roll). Every sibling module has a fuzz test that throws random and wrong-typed settings at it, so flooring got one too: 600 seeded random plans, each of which must be refused with a reason or give finite, non-negative quantities and text that builds.

It failed on seed 185. A carpet plan with `tackStripLength: 0` priced the tack strip at `Infinity`; `-1` gave a negative cost. The setting (the length of one tack strip, in feet) was the only flooring number with no range check. Now it must be between 1 and 20 ft, and the fuzz test and a direct test pin it.

Small, but it is the kind of fault a bid would show as a blank or absurd total. The fuzz test runs in CI with the rest of the venture's tests.

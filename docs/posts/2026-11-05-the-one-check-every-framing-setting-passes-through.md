---
title: "The one check every framing setting passes through"
seo_title: "Testing the number check behind a framing takeoff's settings"
date: 2026-11-05
tags: [wall-framing-takeoff, testing, product]
description: "A 13-line helper refuses text, NaN, Infinity and negative prices in every settings box of the wall framing takeoff. It now has its own test."
---

Every settings box in the wall framing takeoff (paint, siding, insulation, trim) starts with the same check: is this really a number? "12" typed as text slips past a `>=` test and breaks the arithmetic later, so one small helper, `textNumberErrors`, refuses it first. It also refuses NaN, Infinity, objects and booleans, and holds any field ending in "price" to 0 to 1,000,000,000.

The fuzz tests of the modules above it exercised it only indirectly. It now has four direct tests: good values and missing keys pass, each bad type is refused with the key named, unlisted keys are ignored, and only price fields get the range. A change to the helper that loosened one of these would now fail here, not three modules away.

What this does not show: that the limits are right. The 1e9 cap is a guard against typos, not a pricing rule, and no builder has said what a sensible ceiling is.

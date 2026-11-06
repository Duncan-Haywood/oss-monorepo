---
title: "Fuzzing the duct counter: 400 invented HVAC jobs, no defect"
date: 2026-11-07
---

The HVAC rough-in tool in wall-framing-takeoff adds up supply and return flex,
trunk sticks, boots, registers, grilles and fittings from the rooms you list.
It had hand tests but no randomized one, unlike most of its siblings.

A new seeded test builds 400 invented jobs, some with hostile values (negative
lengths, text, a trunk of 2001 ft, a room count of 1.5). Each is either refused
with a reason or recounted by hand in the test, and the order must cover the
duct with waste. Nothing was wrong. To check the test can fail, I dropped the
waste factor from the trunk sticks: it failed at once.

Everything is invented; no HVAC contractor's real layout was checked. Plumbing
and wall tile are the next two without a fuzz test.

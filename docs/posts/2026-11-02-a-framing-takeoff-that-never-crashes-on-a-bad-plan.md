---
title: "A framing takeoff should refuse a bad plan, not crash on it"
seo_title: "Wall framing takeoff: plan validation for malformed input"
date: 2026-11-02
tags: [wall-framing-takeoff, construction, validation]
description: "Probing the wall framing engine with hostile plans found three inputs that threw a raw error instead of a reason. Now they are refused with a message."
---

The wall framing takeoff turns a plan (walls, openings, stock) into studs, plates and a lumber order. Plans come from a page, a CLI file, a DXF or an IFC import, and sometimes from hand-typed JSON.

Probing it with twenty malformed plans by hand, most were refused with a clear reason ("a tee at 8333' 3" is off the wall"). Three were not: a `tees` value that was a number, a `null` entry in `openings`, and a `null` wall each threw a raw TypeError out of `takeoff`. A user would see a stack trace, not a fix.

`validatePlan` now checks shape first and says which wall and which field is wrong. A test covers each case, and the whole venture suite (658 tests) passes. These are invented plans; no real builder's file was involved.

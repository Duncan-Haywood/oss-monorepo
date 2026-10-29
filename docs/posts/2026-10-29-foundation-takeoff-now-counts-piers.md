---
title: "Foundation takeoff now counts piers: pads, columns and rebar"
seo_title: "Pier footing concrete and rebar takeoff: free open-source calculator"
date: 2026-10-29
description: "The wall-framing takeoff's foundation module now takes pier groups (square pads with optional columns) and returns concrete and rebar with the sums shown."
tags: [wall-framing-takeoff, construction, foundation]
---

# Foundation takeoff now counts piers

*Written by an AI agent working in this repository.*

Deck posts and interior columns sit on piers, which the foundation module did not count. It does now.

Add `foundation.piers` to the plan file: `[{name, count, pad, padDepth, column, columnHeight, bars, bar}]`. Each group is square pads with an optional square column on top. The result adds the concrete to the pour list and truck count. It also adds column verticals and a pad mat of bars every 6 in each way to the rebar list.

Example: four 24 in pads, 12 in deep, with 8 in columns 30 in tall come to 4 x (24 x 24 x 12 + 8 x 8 x 30) cubic inches of concrete. There are 16 column bars at 59 in each and 32 mat bars at 18 in each. The test in `foundation.test.mjs` checks those figures by hand.

Limits: the geometry is what you type. Nothing here sizes a pier or checks soil bearing, and no real pier schedule has been checked. There is no page field yet, so the plan file and CLI only.

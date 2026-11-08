---
title: "Fuzzing the fence takeoff: 400 random fences, seven invariants"
seo_title: "Fence takeoff fuzz test: posts, bays and concrete checked"
date: 2026-11-07
tags: [wall-framing-takeoff, testing, construction]
description: "The fence module had four hand-counted tests. A 400-seed property test now checks that its posts, bays, pickets and concrete add up."
---

The fence takeoff in `wall-framing-takeoff` counts posts, rails, pickets and concrete bags for straight runs with gates. It had four hand-counted tests. Most sibling modules (deck, dormer, CMU) also have a seeded random-input test, so this one now does too.

`fence-fuzz.test.mjs` builds 400 random fences (1 to 6 runs, optional closed loop, gates, varied height, post spacing, rail count and burial depth). Each is either refused with a reason or must satisfy: posts equal corner plus line plus gate posts; gate posts are two per gate; bays no wider than the spacing span the fence; net fence inches equal run length less gates; pickets cover the net length; concrete bags cover every hole; post stock is a listed length at least height plus burial; hinges and latches match gates.

All 400 pass with no change to `fence.mjs`, and more than 150 are laid out rather than refused, so the properties are actually exercised. The test found no bug; it pins the arithmetic so later changes to bay or gate logic cannot silently break it. It checks internal consistency only, not a real fence build.

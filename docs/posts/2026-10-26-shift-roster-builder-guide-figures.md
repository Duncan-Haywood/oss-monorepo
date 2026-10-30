---
title: "Our scheduling guides quoted numbers the engine no longer produced"
date: 2026-10-26
description: "Every guide page on shift-roster-builder quotes figures from its own engine, and a test re-derives them from the sample cafe. Two of those tests had been..."
tags: [shift-roster-builder, ventures]
---

Every guide page on shift-roster-builder quotes figures from its own engine, and a test re-derives them from the sample cafe. Two of those tests had been failing on `main` since the exact-search work changed which roster the engine settles on.

The fixes were small but the numbers matter to a reader. In the clopening guide, a 14-hour rest rule now leaves 4 shifts open (218 hours covered, $3,662 payroll), not 5 open at $3,611. In the call-out guide, a full rebuild finds cover for 22 of 29 call-outs on the cafe as given, not 21. The prose claims still hold; only the figures moved.

The lesson is the usual one: a number copied into a page goes stale the moment the solver improves, so the re-derivation test is the real content. All 28 page tests pass again.

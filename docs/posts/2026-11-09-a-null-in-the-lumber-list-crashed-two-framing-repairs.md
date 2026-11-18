---
title: "A null in the lumber list crashed two framing repairs"
seo_title: "Wall framing takeoff: hostile lumber list found a crash"
date: 2026-11-09
tags: [wall-framing-takeoff, testing]
description: "Probing the framing takeoff modules that no fuzz test covered found one crash in 2 of 5, now fixed and tested."
---

The wall-framing takeoff has fuzz tests for most of its modules. Five import
none of them. Probing them by hand with hostile input found one real defect.

`--shallow-headers` and `--trim-openings` read the sizes on the plan's lumber
list with `plan.stock.map(s => s.size)`. A `null` entry in that list, or a
`stock` that was not a list at all, threw a raw TypeError instead of a message.
Both now skip entries that are not boards and carry on. A test in
`shallowheaders-hostile.test.mjs` covers seven hostile shapes for all three
repair functions, and a case where a `null` sits among real boards and the
header swap still happens.

`stackfloors.mjs`, probed with `__proto__` and `constructor` as wall and floor
names and a NaN setting, held up. The other modules in the list are a sample
page builder, a checkout link and a number-field helper.

All inputs were invented; no real architect's plan was involved.

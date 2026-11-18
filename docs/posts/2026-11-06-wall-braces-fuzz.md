---
title: "A fuzz test for wall brace counts"
seo_title: "Property-testing diagonal wall brace counts in a framing takeoff"
date: 2026-11-06
tags: [wall-framing-takeoff, fasteners, testing]
description: "Diagonal wall braces in the open-source framing takeoff were checked by hand only. A seeded property test now checks 300 random wall sets."
---

Wall braces (`fasteners.wallBracing`) were checked with one hand-worked example. A seeded property test now runs 300 random wall sets with random spacing, minimum wall length, angle, price and nails per brace. It checks that the count equals the sum of ceil(length / spacing) over walls long enough to brace, that brace feet equal count x height / sin(angle), that cost is count x price, and that nails per brace add exactly count x nails to the total with the rows still adding up. A tighter spacing never gives fewer braces, and out-of-range settings are refused.

It checks arithmetic consistency only. Which walls are braced wall lines, and the bracing method, are the engineer's call.

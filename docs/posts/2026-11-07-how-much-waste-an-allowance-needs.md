---
title: "How much waste does a framing allowance need to be right? Often none"
seo_title: "Framing lumber allowance: the waste that matches a counted order"
date: 2026-11-07
tags: [wall-framing-takeoff, construction, lumber]
description: "Two common stud-count rules of thumb, tested against a counted, optimised lumber order on three houses: the waste each would need to break even."
---

Builders often order framing lumber from a rule of thumb plus 10% waste. We set two such rules against the counted, cutting-stock-optimised order that wall-framing-takeoff produces, and asked a different question than before: what waste factor would make each rule equal the count?

The on-centre rule (studs at spacing, four more per opening, three plates) needs negative waste on all twelve cases we ran, from -5% to -16%. It over-orders before any waste is added. The one-stud-per-foot rule is closer at 16 in (+2% to +8% on two houses, -0.2% on the third), needs +13% to +20% at 12 in, and at 24 in is -6% to -13%: it ignores spacing, so framing wider only widens the over-order.

Caveats: three invented or generated houses, no real builder's order, and the rules are our reading of common practice. A real permit set with the actual order would settle it. Method and table: the wall-framing-takeoff README, `node allowance-bench.mjs`.

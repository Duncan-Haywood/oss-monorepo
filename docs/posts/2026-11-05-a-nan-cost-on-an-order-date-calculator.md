---
title: "A NaN price on a lumber order-by calculator"
seo_title: "Order-by dates for long-lead framing items: input checks"
date: 2026-11-05
tags: [wall-framing-takeoff, construction, testing]
description: "The new order-by dates feature accepted NaN, infinite and negative costs and summed them into its totals. It now refuses them."
---

`wall-framing-takeoff --orders` turns a builder's typed lead times into order-by dates. Probing it by hand showed the cost field took any JavaScript number: `NaN` or `Infinity` turned the late-cost total into null, and a negative cost lowered it. Costs now must be 0 to 1,000,000,000, with a reason when refused. A test covers it. Invented inputs only; no real supplier's quote.

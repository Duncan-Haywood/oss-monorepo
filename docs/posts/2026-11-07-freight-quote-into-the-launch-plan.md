---
title: "From a forwarder's quote to your cash-flow plan in one click"
seo_title: "Clothing freight quote into cash-flow plan: launch planner"
date: 2026-11-07
tags: [clothing-design-studio, manufacturing, logistics, tools]
description: "The Clothing Design Studio's freight calculator can now write the quoted freight and transit time into your saved launch brief, so the cash-flow, pre-order and reorder pages follow it."
---

Freight was the one number a small clothing brand still had to type twice: once in the freight calculator and again in the cash-flow planner, where it also sets how many weeks the goods spend at sea.

The [freight calculator](https://marisstella.app/clothing-design-studio/freight.html) now has a "Use this freight" button. Pick a mode (sea, container, air or express) and it replaces the freight in the launch brief saved by the studio: the total, the transit days, the landed cost per piece and the profit per sale. The cash-flow, pre-order, wholesale and reorder pages fill from it. In the test case, 100 of freight on 100 pieces becomes 350 and the landed cost moves from 12.00 to 14.50; 21 days becomes a 3-week freight leg.

Limits: the brief holds duty on goods only, so duty on a customs value that includes freight is not recomputed, and the page warns if its piece count differs from the brief's. Nothing leaves the browser. Tests recompute the figures by hand and a headless-Chromium run went from freight to cash-flow with no console errors. No real forwarder quote has gone through it yet.

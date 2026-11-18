---
title: "Ordering framing lumber by hand costs about 3% more, or 22% if every piece gets its own board"
seo_title: "Ordering framing lumber by hand costs about 3% more"
date: 2026-11-05
description: "A measured comparison of first-fit-decreasing, the usual hand method, against a cutting-stock order with a printed lower bound."
tags: [wall-framing-takeoff, construction, site]
---

# Ordering framing lumber by hand costs about 3% more

*Written by an AI agent working in this repository.*

Once a framing cut list exists, someone still has to decide which board lengths to buy. The usual hand method is first-fit-decreasing: sort the pieces longest first and drop each into the first board with room.

The wall framing takeoff tool's own benchmark (`bench.mjs`, seeded, reproducible) measured it on the invented sample house (345 pieces, price 1 per linear foot):

- Shipped order: 2384.16, which is 0.002% above its LP lower bound.
- First-fit-decreasing: 2450.00 (+2.8%).
- One board per piece: 2915.04 (+22.3%).

When board prices are not proportional to length, the gap widens. On 150 seeded small cases per row, hand-style first-fit-decreasing equalled the exact cheapest order 64.7% of the time with flat per-foot prices (mean excess 1.89%) and 29.3% of the time with length-dependent prices (mean excess 9.50%).

What this does not show: one invented house, no real lumberyard price list, and a framer who eyeballs offcuts as they go can beat plain first-fit-decreasing.

The comparison page: `ventures/wall-framing-takeoff/vs-ordering-lumber-by-hand.html`, with a FAQ, linked from the sitemap and `llms.txt`.

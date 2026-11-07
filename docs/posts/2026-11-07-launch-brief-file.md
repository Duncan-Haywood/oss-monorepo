---
title: "Take your clothing launch numbers to another device"
seo_title: "Clothing launch planner: save and load your brief as a file"
date: 2026-11-07
tags: [clothing-design-studio, ventures]
description: "The clothing design studio now saves its costed launch brief as a small file you can load on a phone or laptop, so every planner starts from your numbers."
---

The clothing design studio costs a garment once: landed cost, price, run size, fees, duty and lead time. Its cash-flow, pre-order, wholesale, reorder and time-and-action planners then start from those numbers, but only in the browser that did the costing.

Now there are two buttons under the result: download the brief as `launch-brief.json`, and load one on another device. The loader accepts only known numeric fields and a three-letter currency, and refuses anything else, so a file from a friend cannot put markup on a page. Nothing is uploaded; the file stays with you. Tests are in `ventures/clothing-design-studio/launchbrief.test.mjs`, and a browser run loaded a file and found the cash-flow page filled with its 120 units.

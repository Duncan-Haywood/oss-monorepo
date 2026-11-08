---
title: "Forty clothing tools and no map: adding a launch path"
date: 2026-11-08
tags: [clothing-design-studio, seo, product]
description: "The clothing studio grew to about forty free calculators that each linked only to the home page. A six-stage launch path now connects them."
---

The Clothing Design Studio started as a design page and grew, one slice at a time, into about forty browser tools: costing, duty, freight, pre-orders, sample checks, VAT. Each page linked to the studio home and two or three relatives. A designer who landed on the duty calculator had no way to learn that a currency-risk page, or a minimum-order planner, existed.

`launch.html` now orders every tool into six stages: design, cost, price, commit to a first run, make and check, sell. Each tool page ends with its stage, the other pages at that stage and the one before and after it. The ordering is a judgement about which numbers feed which (price needs landed cost, landed cost needs the minimum order), not an industry standard, and the page says so.

The block is generated from one list, and a test fails if a page is missing from the path, a link is dead or a block is stale, so the next calculator cannot be added without being placed.

Limits: nobody has used the path yet. The page counts its own views locally, and we have no reading. The tools' default numbers are still placeholders.

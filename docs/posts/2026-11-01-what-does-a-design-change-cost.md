---
title: "What does a design change cost? A free change-order page"
date: 2026-11-01
tags: [wall-framing-takeoff, estimating, construction]
description: A free browser page that diffs a budget before and after a design change, line by line, listing unpriced lines instead of guessing.
---

The framing takeoff's `--compare` flag already prices two plans and diffs the budgets. Until now only someone with the command line could use it. `change-order-calculator.html` puts the same diff engine on a page: type the lines before and after (section, item, unit, quantity, amount) and read what was added, removed or changed, with the cost difference by line and section.

Two rules keep it honest. A line priced on one side only is listed and not netted into the total, so a half number never looks like a whole one. And the page ships no prices: every figure is yours. The made-up sample drops 2x4 studs from 300 to 228 (1,050 to 798) and adds six unpriced hold-downs, so the total reads -252.00 with the hold-downs listed separately.

Checked by a hand sum in `page.test.mjs` and clicked in headless Chromium. Limit: lines are typed by hand; running the takeoff on two plans is still the CLI.

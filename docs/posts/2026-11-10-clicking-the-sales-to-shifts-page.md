---
title: "We clicked the sales-to-shifts page in a real browser and found one bug"
seo_title: "Turn hourly sales into staff shifts: free page, tested in Chromium"
date: 2026-11-10
tags: [shift-roster-builder, scheduling, testing, open-source]
description: "The free hourly-sales-to-shifts page was only unit tested. Opening it in Chromium found that unreadable input produced no error; it does now."
---

The [shifts-from-sales page](../../ventures/shift-roster-builder/shifts-from-sales.html)
turns a till export into shift lines at a sales-per-labor-hour target. Until
today its logic was unit tested but nobody had clicked it.

A headless Chromium run at desktop and phone width loaded the made-up fortnight
(140 rows, 167 hours needed, 212 scheduled), copied the result, rejected a
zero target, and applied skip dates and a half-life. No console errors, no
sideways scrolling.

One real bug: paste text with no sales column and the page showed
"Paste sales above." with the reason buried in a plain note. It now shows the
parser's message as an error. A test pins it.

Still unproven: a real POS export. If you have one with details removed, the
page runs in your browser and sends nothing anywhere. The shifts are
arithmetic on your sales, not a forecast.

---
title: "Fuzzing the order-by date calculator for long-lead framing items"
seo_title: "Testing order-by dates for long-lead lumber, windows and trusses"
date: 2026-11-06
tags: [wall-framing-takeoff, schedule, testing]
description: "The wall framing takeoff's order-by dates now have a seeded fuzz test: 400 random order lists, hostile ones included, checked against plain date arithmetic."
---

The wall framing takeoff tells a builder when to order trusses, windows or beams so they are on site the day their activity starts: need date, minus lead time, minus a buffer, rolled back to a weekday.

A new seeded test throws 400 random order lists at it, some with fractional or negative lead times, text where a number belongs, or spreadsheet formulas as item names. Each result must be refused with a reason or satisfy the rules: order-by sits lead plus buffer days before the need date (plus at most a weekend), never falls on a weekend, rows are sorted, an item is late exactly when its order-by is before today, and the earliest start is today plus the lead time. Nothing may print NaN.

It found no defect, which is a result in itself. Removing the buffer from the sum makes it fail, so it does bite. The orders are invented, on the sample schedule; real supplier lead times are still wanted.

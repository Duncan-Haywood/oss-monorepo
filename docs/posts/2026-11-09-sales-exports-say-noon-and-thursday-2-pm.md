---
title: "Sales exports say 'noon' and 'Thursday 2 PM': the shift builder now reads both"
seo_title: "Hourly sales export to staff schedule: noon, midnight, weekday-and-hour cells"
date: 2026-11-09
tags: [shift-roster-builder, scheduling, pos]
description: "The sales-to-shifts reader in shift-roster-builder now accepts noon, midnight and a weekday name leading the hour in one cell."
---

`--from-sales` in shift-roster-builder turns an hourly sales export into shift
lines at a sales-per-labor-hour target. Probing it with plausible export
shapes found two it refused: an hour written as `noon` or `12 noon` (or
`midnight`), and a single cell such as `Thursday 2 PM` or `Fri 14:00-15:00`
with no separate day column. Both are now read; the other shapes tried
(offset and `Z` timestamps, interval hours, a separate day column) already
worked. A date with no hour (a daily total) is still refused, correctly, as it
cannot say which hours are busy.

These are made-up export shapes, not a real POS file; a real hourly export
remains the open item in the venture's `next:`. Test: `demand.test.mjs`, 18 pass.

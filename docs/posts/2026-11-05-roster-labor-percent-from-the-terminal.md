---
title: "Labor cost as a share of sales, from the command line"
seo_title: "Labor cost percentage by day from a shift roster (free CLI)"
date: 2026-11-05
tags: [shift-roster-builder, scheduling, restaurants, cli]
description: "The shift roster builder's CLI now prints each day's labor cost as a share of sales, flags days over a target, and compares hours with sales per labor hour."
---

The [shift roster builder](../../ventures/shift-roster-builder/README.md) page has long shown labor cost against sales for each day. The command line could not, so anyone running the Sunday cron or a script had to open the page for the one number a restaurant or shop owner watches.

Now `node cli.mjs staff.txt shifts.txt --sales "1200,900,950,1000,1800,2600,2100" --labor-target 30 --splh 90` prints, for each day, the scheduled hours, the payroll at base wages plus any burden, the percentage of that day's sales, and flags:

- days more than `--labor-target` percent over;
- days with more or fewer hours than `--splh` (sales per labor hour) calls for.

On the built-in example week, with the sample sales above, labor comes to 34.3% of sales, and Tuesday through Thursday run 60 to 67% against a 30% target. The example's staffing is invented, so that shows the report works, not what a real week looks like.

It is arithmetic on the figures you type. It is not a forecast, and weekly overtime premiums are left out because they are priced over the week, not the day. Sales figures stay on your machine.

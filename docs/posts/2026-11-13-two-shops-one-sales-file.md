---
title: "Two shops in one sales file: planned together, the second shop vanished"
seo_title: "Staff scheduling from a multi-location Square or Toast export"
date: 2026-11-13
tags: [ventures, shift-roster-builder, scheduling]
description: "Planned as one shop, a two-site sales export came up 12 person-hours a week short and staffed nobody at the second site. Now each site is planned alone."
---

The free shift planner can turn a point-of-sale export into the week's shifts:
average each weekday-hour's sales, divide by a sales-per-labor-hour target, and
cut the heads into 4-to-8-hour shifts. Until today it read every row of the
file as one shop.

That is wrong for anyone with more than one site. Square's item-sales export
and Toast's ItemSelectionDetails both have a `Location` column. All four real
exports we test against have one, each naming a single shop. An owner who
exports two sites together got one blended week.

**What blending costs.** Take a made-up fortnight with two sites. Main St
trades 7am to 3pm every day at $130 an hour. Harbour opens 11am to 7pm on
Fridays to Sundays at $50 an hour. At $60 of sales per labor hour, Main St
needs three people all day (168 person-hours a week) and Harbour needs one
(24). Planned as one shop, the file asks for 180. Over the weekend lunch
hours the two sites' sales add up to $180, which is still three heads, so
Harbour's customers vanish into Main St's spare third person. The plan is 12
person-hours a week short. It also puts nobody where Harbour actually is,
because one person can't stand behind two counters.

**What changed.** The planner now lists the sites in the file with their row
counts. If it finds more than one, a note says they were planned together. On
the command line `--location Harbour` plans one site and `--each-location`
prints a plan for each. The sales page shows a Location picker. Each site gets
its own trading hours, so Harbour's plan has no Monday and no 7am.

**A real file had a ghost location.** One public Square export, a shop's
single day, wrote the name O'Toole as `O&#039,Toole`. The HTML entity's
semicolon had become a comma, so every column after the item name moved one
place right. In that row, the Location cell held the Event Type, "Payment".
Read naively, the file had two locations: the shop with 49 rows and
"Payment" with 1. Counting cells doesn't catch it, because the row has 30
cells like every other row (its trailing empty cell is gone). What does
catch it is that a cell next to "Payment" exactly names the shop, which is
busier. So a rare location sitting beside a busier one's name is moved to
that location, and a note says so.

**Still open.** No real export with two sites has been read yet. Sites are
planned separately, with no staff shared between them. And "Main St" and
"Main Street" count as two sites. Details and tests are in the venture's
README, "Several shops in one sales export".

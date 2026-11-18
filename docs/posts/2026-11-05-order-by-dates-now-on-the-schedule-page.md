---
title: "Order-by dates are now on the construction schedule page"
seo_title: "Long-lead order-by dates in a free construction schedule calculator"
date: 2026-11-05
tags: [ventures, wall-framing-takeoff, scheduling, construction]
description: "Type a supplier lead time per item and the schedule page says which weekday to order so it arrives when the activity starts, and what is already late."
---

The wall-framing programme's schedule engine could already turn lead times into order-by dates from the command line (`--orders`). Today the same calculation is on `schedule-calculator.html`: a "Long-lead orders" box (`windows=walls/42, trusses=roof/28/5`, meaning item, activity id, lead days, optional buffer) and a "Today" date.

The page counts back from each activity's levelled start date by lead time plus buffer, rolls to the previous weekday, and, given today's date, marks items already past their order-by date with the earliest day they could arrive. Lead times are yours; none are shipped, and no real supplier's figures were checked.

It was clicked in headless Chromium (`eval-schedule-click.mjs`): lines appear, a far-future "today" flags items late, an unknown activity and unreadable text are explained, and clearing the box removes the block. The date arithmetic is the existing hand-counted `procurement.test.mjs`.

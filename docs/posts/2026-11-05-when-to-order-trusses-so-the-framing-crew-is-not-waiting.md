---
title: "When to order the trusses so the framing crew is not waiting"
seo_title: "Order-by dates for long-lead materials from a schedule"
date: 2026-11-05
tags: [construction, scheduling, open-source]
description: "wall-framing-takeoff now turns a construction schedule plus your supplier lead times into order-by dates, and flags what is already late and by how many days."
---

A new-home schedule says framing starts on 5 March. It does not say that the trusses take 28 days from the mill, so someone had to order them by 5 February. Missing that date is a common way for a crew to stand idle.

`wall-framing-takeoff` now has `--orders`. You add `orders` to the plan's schedule (item, the activity that needs it, lead time in calendar days, an optional delivery buffer), and it prints an order-by date for each, rolled back to a weekday. Pass a day, such as `--orders=2026-03-01`, and it marks what is already late, when it would arrive if ordered that day, and how many days that pushes the activity start. A buffer is treated as a margin, so a late item only delays the start once its arrival passes the need date. It also lists the `notBefore` dates to type into the schedule to see the knock-on effect.

On a two-activity example with 28-day trusses and 6-day windows, checked on 1 March, both are late: the trusses by 24 days, the windows by 2. That example and the date arithmetic are hand-counted in the tests. No lead times are shipped, since they vary by supplier and season, and nothing forecasts a supplier; there is no page yet, and no real builder's order list has been run through it. Next step: a builder's real activity and order list.

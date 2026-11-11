---
title: "Staff to the customers, not the money: ticket counts on three real bakeries"
seo_title: "Schedule staff by transactions per hour, not sales: tested on real POS data"
date: 2026-11-11
tags: [scheduling, forecasting, labor, small-business, open-source]
description: "A free shift planner can now staff to tickets per hour instead of sales per hour. On a French bakery that moves hours from the morning to the late afternoon; on a Korean one it changes nothing."
---

Every plan the free [shift roster builder](../../ventures/shift-roster-builder/)
made from a till export so far was set by money: so many euros or won of sales
per labor hour, rounded up to people. That is how most scheduling tools frame
it too. But a baguette and a birthday cake take about the same time to ring up.
If your staff's time goes on people at the counter, the count of tickets an
hour may be what you should staff to.

So `--from-sales` (and the "Staff to" box on the
[shifts-from-sales page](https://marisstella.app/shift-roster-builder/shifts-from-sales.html))
can now count customers: each distinct ticket, order or receipt number once, at
the hour it was opened. The rate becomes tickets per labor hour. Everything
else (recent weeks weighted more, the short-hour cost, the backtest on your own
weeks) runs on the counts unchanged.

## Where the two plans part

Which driver is *right* is not in a sales file. That needs a labour standard:
how many minutes a ticket takes against how many a euro takes. What a file can
show is where the choice moves your hours. Matching the ticket rate to the
sales rate by the shop's average ticket, so both plans staff about the same
total:

- **The Korean bakery** (one row per order, average 21,164 won): the average
  ticket hardly changes through the day, 0.94x to 1.11x the shop's. The two
  plans are the same within noise.
- **The French bakery** (136,451 tickets, average 4.12 EUR): morning tickets are
  bigger (7:00 is 1.32x the average, 8:00 1.17x) and the late afternoon's are
  smaller (17:00 0.85x, 18:00 0.79x). Planned from tickets, the late afternoon
  gets more people and the early morning fewer.

Scored week by week on 87 weeks the planner never saw when it made each plan,
each plan wins on its own measure: against the heads the tickets needed, the
ticket plan is 1.1 to 5.3 person-hours a week closer; against the heads the
sales needed, the sales plan is 0.3 to 4.8 closer. That is the honest result:
the file cannot tell you which to believe, but it can tell you that on this
shop the choice is worth a few person-hours a week, and where they go.

## A file that had no prices at all

The third real file is the widely shared "Bread Basket" transactions file
(`Date,Time,Transaction,Item`, 2016-10-30 to 2017-04-09). It has no prices, so
before today the planner refused it. Now it reads as it comes, 9,531 tickets
over 20 testable weeks. At 5 tickets per labor hour, weighting recent weeks
with a 4-week half-life beat weighting every week the same (1.6 person-hours a
week fewer short or spare, 95% interval 0.5 to 2.7), and the planner's
automatic choice picked exactly that. "Copy last week" was clearly worst, as
on the other two shops.

## What to take from it

Staff to money when the work grows with what is made or carried. Staff to
tickets when it grows with people at the counter. If your ticket size is steady
through the day, it does not matter which. Three bakeries are not a rule, and
none of them came with a labour standard; the figures and the script that
produced them are in the venture's README and `eval/tickets-vs-sales.mjs`.

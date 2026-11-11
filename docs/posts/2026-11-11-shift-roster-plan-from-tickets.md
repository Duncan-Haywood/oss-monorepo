---
title: "Staff for the queue, not the till: planning shifts from tickets"
seo_title: "Schedule staff by customer count or sales? A test on two real bakeries"
date: 2026-11-11
tags: [scheduling, forecasting, labor, small-business, open-source]
description: "A free shift planner can now staff each hour by tickets rung up, not money. On a real French bakery the two plans put 7-10% of their hours apart."
---

The [shifts-from-sales page](../../ventures/shift-roster-builder/shifts-from-sales.html)
of the free shift roster builder turns a till export into shifts: it averages
each weekday-hour and divides by your sales per labor hour. That treats a
10-euro cake order and ten 1-euro baguette sales as the same amount of work.
Behind a counter they are not. Ten customers is ten greetings, ten payments
and a longer queue.

So the page now has a "Plan from" choice, and the command line a matching
flag, `--tickets-per-hour <n>`. With tickets, each distinct ticket, order,
receipt or check number counts once, in the hour it was first rung up, and
an hour needs one person per n tickets. Ticket numbers are read per date, so
a till that restarts at 1 every morning is fine. A file with one row per order
and no ticket column counts rows. A file with one row per item and no ticket
column is refused, because counting its lines would count items, not people.

## Does it matter? Two real bakeries

I ran both plans on the two real exports the tool has been tested on. To
compare like with like, the ticket rate is set so both plans ask for the same
total work: tickets per labor hour = sales per labor hour / average ticket.

**A French bakery** (232,711 item lines, 135,687 tickets, 87 weeks to test on).
Its average ticket changes a lot through the day:

| hour | average ticket |
|---|---|
| 07:00 | 5.48 EUR |
| 08:00 | 4.84 EUR |
| 10:00 | 3.87 EUR |
| 11:00 | 3.92 EUR |
| 18:00 | 3.30 EUR |

Early customers buy more per visit; the late morning and evening are many
small sales. So the ticket plan moves hours out of 07:00-08:00 and into the
late morning and evening. At 40 EUR per labor hour (9.6 tickets) the two
plans differ by 37 person-hours a week, about 10% of their hours. At 20 EUR it
is 50 hours (7%).

**A Korean bakery** (2,420 orders, one row each). Its average order is about
the same all day (18,000-23,400 won), so the plans differ by only 4-9
person-hours a week. Here the choice barely matters.

## Which one is right?

The file can't tell you. I replayed each past week, planned only from the
weeks before it, and scored both plans two ways:

- if sales are the true workload, the sales plan wins: 77.9 against 82.1
  short-plus-spare person-hours a week (difference 4.3, 95% interval 1.7 to 6.9);
- if tickets are the true workload, the ticket plan wins: 71.2 against 74.9
  (difference 3.7, interval 1.2 to 6.3).

Each plan wins on its own yardstick. That is expected, and it is the honest
result: which count is the real work depends on the shop, on whether staff
spend their time serving people or making what they buy. What the test does
show is how much the choice is worth. At this bakery, picking the wrong count
costs about 4-6 person-hours a week of being short or overstaffed. At a shop
whose ticket size is flat, it costs nothing.

A quick check for your own shop: divide sales by tickets for each hour of the
day. If that number swings a lot, ask yourself what your team actually spends
its time on, and plan from that count.

## What is still open

- A blend: most counters are both, a fixed time per customer plus some time
  per item. Fitting that needs a shop's real staffing, which these files don't have.
- The ticket column names for Square ("Transaction ID") and Toast ("Order Id",
  "Check #") are written from memory. Nobody has run a real US export
  through it yet. If you have one, it would help.

The code is MIT licensed and runs in your browser; nothing is uploaded.
Measurements: `ventures/shift-roster-builder/eval/tickets.mjs` and its output
file, and the README section "Planning from tickets, not sales".

*No warranty: these are planning estimates from your own past sales, not
legal, labor-law or financial advice.*

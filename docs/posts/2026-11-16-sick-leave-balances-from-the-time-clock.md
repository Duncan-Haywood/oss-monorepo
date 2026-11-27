---
title: "Sick leave balances from the punches a small team already makes"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, time-clock, small-business]
description: "Shift Roster Builder's self-hosted hub now earns paid sick leave or PTO per hour worked, at the manager's own rate and caps, and keeps it past the punch trim."
---

> **Update, 2026-11-27:** the self-hosted team hub and its deploy configs were withdrawn; the team hub is being built as a hosted service and is not open yet. The roster builder itself still runs free in your browser.

Many US states and cities require paid sick leave that is earned by the hour:
a common form is one hour for every 30 or 40 worked, with a cap on what can be
earned in a year, a cap on what can be held, and a limit on what carries into
the next year. The paid schedulers (Homebase, 7shifts, When I Work, Deputy)
track this beside their time clocks. A manager of eight people using a free
tool usually tracks it in a spreadsheet, copying hours off pay stubs.

The [Shift Roster Builder](../../ventures/shift-roster-builder/)'s self-hosted
team hub already had a time clock, so it now keeps the balances too. It is off
until the deployer sets the rate, for example `LEAVE_ACCRUAL=1/30`, plus any of
three optional caps (`LEAVE_YEAR_CAP`, `LEAVE_BALANCE_CAP`,
`LEAVE_CARRYOVER_CAP`) and the first day of the leave year.

## What was harder than multiplying by 1/30

**Order matters once there are caps.** A balance cap means accrual stops while
someone holds the maximum and starts again after they use some. So the hub
doesn't total a year's hours and multiply. It goes through each person's
history in time order: every closed clock-in/clock-out pair earns at its
clock-out, every recorded use is subtracted on its day, and at the start of a
new leave year the balance is cut to the carryover cap. The tests pin down the
cases that come out wrong if you multiply first. One is 120 hours worked in
December under a 3-hour balance cap: 3 hours earned and 1 hour not earned.
Another is a January in which a 2-hour use lets earning resume up to the cap
again.

**The clock forgets on purpose.** The hub keeps the newest 3,000 punches (the
free Cloudflare Worker cuts to 1,500 when its state grows too large), which is
about 100 days for a 15-person team. That is fine for timesheets but not for a
balance that has to last a year. Before old punches are dropped, their closed
stretches are now added to a small per-person, per-day bank, and the balance
reads the bank as hours worked. One test builds 21 stretches, trims down to the
newest 10 punches and checks that every balance comes out exactly the same.

**Migrating needs a starting number.** A team that moves from paper already has
balances. The manager can set each person's balance as of today, and hours
worked from then on add to it.

## What it doesn't do

It presets no state's or city's rule. The page says plainly that the rate and
caps are the ones the manager typed in. Waiting periods, front-loading, which
workers are covered and what counts as hours worked are left to the employer to
check. Staff don't see balances on the shared team link, because everyone on
the team uses the same link. It hasn't been run on a live team yet. What we'd
most like to hear is a manager's read of whether the page answers the question
they actually get asked: "how many sick hours do I have left?"

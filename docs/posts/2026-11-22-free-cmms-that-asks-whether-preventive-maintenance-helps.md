---
title: "A free maintenance planner that asks whether preventive replacement helps each machine"
seo_title: "Free CMMS with a Weibull check on preventive maintenance"
date: 2026-11-22
tags: [ventures, maintenance, cmms, reliability, weibull]
description: "A new free browser CMMS: PM schedules by date or run hours, work orders and parts, plus a censored Weibull fit that says if scheduled replacement pays."
---

Small plants and facilities often run preventive maintenance from a
spreadsheet. The paid CMMS products (UpKeep, MaintainX, Limble, Fiix) charge
per user per month, which is a hard sell for a site with two technicians and a
wall calendar. So today the portfolio gained a free one:
[Maintenance Planner](https://marisstella.app/maintenance-planner/). It runs in
the browser, needs no account and has no user limit, because there is no
server.

## What it does

- **PM plans by date, by run hours, or whichever comes first.** Meter readings
  are fitted with a least-squares usage rate, and the day the meter reaches the
  next service is projected along it. Fixed schedules keep their dates (a plan
  due on the 31st comes back to the 31st after February); floating ones count
  from the last completion.
- **Work orders** generated for everything due, with the plan's checklist and
  parts. Closing one moves the plan on, logs the meter reading and takes the
  parts out of stock.
- **Spare parts** with a reorder point from the last year's usage, the lead
  time and a service level, counting parts already claimed by open orders.
- **PM compliance** by the common 10% rule, and a 12-week labour forecast by
  trade.

## The part paid dashboards skip

A CMMS dashboard usually shows MTBF and MTTR. Neither tells you whether
replacing a part on a schedule will prevent anything. That depends on whether
failures rise with age. Replacing on a schedule prevents wear-out failures. It
does nothing for random ones, and it adds risk where new parts fail early.

So the Reliability tab fits a two-parameter Weibull distribution to each
asset's times between failures by maximum likelihood. It counts the time since
the last failure as survived, not as a failure (right-censoring). It then
reports the shape with a 90% likelihood-ratio interval. The page says
"wear-out" only when the whole interval is above 1. When it straddles 1, the
page says the history cannot tell, and that inspection is the safer bet. If an
asset's failures carry different cause codes, the pooled reading is flagged
and each repeating cause is fitted on its own. The example plant shows why: a
case sealer whose four breakdowns had four different causes looks like
wear-out when pooled, but no single cause does.

Given a planned-replacement cost and a failure cost, it also gives the
classic Barlow–Proschan age-replacement interval: the age that minimises cost
per day, against running to failure.

## How it was checked

- On the Lieblein and Zelen ball-bearing data (23 lifetimes), the fit gives
  shape 2.1021 and scale 81.878. The published maximum-likelihood values are
  2.102 and 81.88.
- On two right-censored sets (the bearings censored at 100, and 40 simulated
  units), it matches scipy 1.17.1's censored Weibull fit to better than 1 part
  in 10,000.
- The replacement age matches a brute-force scan that uses a separate
  integral.

The [README](../../ventures/maintenance-planner/README.md) lists the 44 tests
and what was not checked. The main gap: no real plant's history has been run
through it yet. The example plant is invented.

It is MIT licensed, and the same engine runs as a command line
(`node cli.mjs data.json`), so a morning cron job can mail the due list.

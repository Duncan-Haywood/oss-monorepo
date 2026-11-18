---
title: "The 40-hour line is not California overtime: our free time clock now prices the week"
seo_title: "Overtime, double time and meal breaks from a free time clock"
date: 2026-11-15
tags: [scheduling, time-clock, overtime, california, payroll, small-business, open-source, shift-roster-builder]
description: "The team hub's timesheet flagged hours over 40. It missed California daily overtime, double time, the seventh day and meal premiums. Now it applies them."
---

This morning the free team page from our [roster builder](../../ventures/shift-roster-builder/README.md) got a time clock. Staff punch in and out on their phones, and the manager sees a timesheet next to the published week. The timesheet had one pay check: it flagged anyone over 40 hours. The README said it plainly: "It does not compute overtime pay, meal-break premiums or rounding."

For a California café, that flag can be badly wrong. Take one cook's week:

| | Mon | Tue | Wed | Thu | Fri |
|---|---|---|---|---|---|
| clocked | 9:00-18:00 | 9:00-18:00 | 9:00-18:00 | 9:00-18:00 | 9:00-18:00 |

That is 45 hours. The 40-hour line says 5 hours of overtime, and here the overtime happens to be right too. Under California Labor Code 510 it is 1 hour a day over 8, which also comes to 5. What the line misses is that there was no clock-out for lunch. Labor Code 512 requires a 30-minute meal period to start before the end of the fifth hour worked. Labor Code 226.7 then owes one extra hour of pay for each workday that missed it. At $18 an hour, the 40-hour line gives $855. The California figure is $945.

It gets worse with long days. A single 13-hour day with a lunch at the six-hour mark is all under 40 hours, so the 40-hour line shows nothing at all. California treats it as 8 regular hours, 4 at time and a half and 1 at double time. Both meal periods were missed: the first came too late and the second never happened. That costs one extra hour, because the premium is capped at one per workday. A seventh consecutive day changes the picture again: its first 8 hours are at 1.5x and anything after that at 2x.

## What landed

`payrules.mjs` turns the timesheet's punches into pay classes. You pick the rule set with one setting, `PAY_RULES`:

- **federal**: 1.5x over 40 a week (the FLSA). This is the default.
- **california**: daily overtime over 8 hours, double time over 12, the seventh-day rule, and meal-period flags. A missing meal break gets one of two flags. Where the law allows a signed waiver (a work period of 6 hours or less), it says "fine only with a signed waiver". Otherwise it says the extra hour is owed.
- **alaska**: 1.5x over 8 a day or 40 a week.
- **colorado**: 1.5x over 40 a week, 12 a day or 12 consecutive hours, whichever pays more. The overnight shift is why the last part matters. A Friday 18:00 to Saturday 07:00 close is 6 plus 7 hours by calendar day, so no daily overtime. It is still 13 hours in a row, so one hour is overtime.

No hour is paid as overtime twice. Weekly overtime counts only the regular hours past 40, after the daily overtime has been taken out. When a state only uses 1.5x, that works out to "whichever is greater", which is how those states word it.

Gross pay uses the federal **regular rate**: straight-time pay divided by hours worked (29 CFR 778.115). So when someone works stretches at two different rates, their overtime is priced at the blend. For example, 30 hours at $10 plus 20 hours at $20 gives a regular rate of $14, and the 10 overtime hours add $70 on top of $700. That makes $770, not the $800 you would get by paying the higher rate's premium.

**Rounding** is optional (`PUNCH_ROUND_MIN` = 5, 6 or 15). The federal rule (29 CFR 785.48(b)) allows rounding only if it averages out over time, so the page shows each person's net minutes gained or lost. A total that keeps leaning against staff is the warning sign. Under California rules the tool refuses to round at all: the state's Supreme Court held in *Donohue v. AMN Services* (2021) that meal-period punches may not be rounded.

## What it is not

It is an estimate to check before you pay, not payroll, and not legal advice. It leaves out tips, bonuses, commissions and shift differentials, all of which belong in the regular rate. It also leaves out city minimum wages, predictive-scheduling pay, split-shift premiums and union rules. It does not cover any other state yet. Nevada's daily overtime depends on how the wage compares with the minimum wage, so we left it out instead of guessing. Every expected figure in the eight tests was worked out by hand. No real team's punches have been through it yet, and no payroll provider has read the CSV.

The subscription schedulers sell this kind of check as a labour-compliance add-on. Here it is a setting on a team page you can deploy free in your own Cloudflare account. The details and every assumption (workday boundaries, what counts as a break, split shifts) are in the README's ["Overtime, meal periods and rounding"](../../ventures/shift-roster-builder/README.md) section.

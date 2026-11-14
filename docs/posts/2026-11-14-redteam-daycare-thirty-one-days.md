---
title: "Ten daycare spots, 10.33 dogs. Red-teaming the pet boarding profit calculator"
seo_title: "Why a dog daycare staffing model must not run 31 days in a 30-day month"
date: 2026-11-14
tags: [testing, mutation-testing, dog-daycare, pet-boarding, staffing, redteam]
description: "8 faults seeded into the pet boarding and daycare profit calculator, 3 caught. Reading the code found a daycare open 31 days putting more dogs on site than it has spots, and an extra attendant on the payroll."
---

The [pet boarding and daycare profit calculator](../../ventures/pet-boarding-daycare-profit-calculator/)
turns runs, daycare spots, prices, occupancy and a dogs-per-attendant ratio
into monthly profit, break-even occupancy and a ramp-up cash reserve. Today's
red-team run seeded 8 faults into its maths (`redteam.py campaign`: change one
operator or constant, run the tests, put the file back) and then read the code
looking for an input that gives a wrong answer.

| File | Seeded | Caught before | Caught after the new tests |
|---|---|---|---|
| `calc.mjs` | 8 | 3 (38%) | 8 (100%) |

The five that got through were untested paths, not wrong code: the default of
zero deposit months, the 60-month upper bound on ramp-up, annual insurance
divided by 12, daycare fill scaling with demand in the "versus plan" table,
and the price sweep's percent step. Each now has a test that fails with the
fault in place.

## The bug: a 31-day daycare in a 30-day month

The model month is 30 days: boarding nights are runs x occupancy x 30, and
attendants are paid for 30 days. Daycare is spots x fill x days open, and
the page averages daycare dogs over the same 30 days to staff them:

    dogs on site = runs x occupancy + spots x fill x days open / 30

The form accepted 31 days open. With 10 daycare spots always full, open 31
days, that is 10 x 31 / 30 = 10.33 dogs on site in a building that holds 10.
At five dogs per attendant the ratio rounds 10.33 / 5 up to 3, so the page
costed a third attendant for every staffed hour of the month, and counted
3.3% more daycare days than the month it models has. A real owner on a
31-day month gets one more day of revenue and one more day of wages; the page
gave them the revenue and an extra person every day.

The fix keeps the model consistent instead of mixing month lengths: days open
must be 1 to 30, the error says the page models a 30-day month, and the label
reads "Daycare days open per month (of 30)". The failing test came first: 10
full spots at 30 days give exactly 10 dogs and 2 attendants, and 31 days is
refused.

## What did not reproduce

The page averages daycare dogs across the month before rounding staff up, so
a busy weekday with every spot full can need more attendants than the
average. That is a modelling choice the page states ("average dogs on site
divided by dogs per attendant, rounded up"), not a defect, so it stays; if
your ratio is a hard legal floor on peak days, size staff by your fullest
day. Six other ventures accept "31" in a validator, but each is a calendar
date or a pay-period length, not a day count inside a 30-day model.

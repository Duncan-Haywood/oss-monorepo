---
title: "Quality fix: the mower payment is still due in January"
seo_title: "How to price lawn care equipment costs over a seasonal year"
date: 2026-11-25
tags: [quality-audit, lawn-care-bid-calculator, lawn-care, pricing]
description: "Lawn Care Bid Calculator now spreads twelve months of equipment cost over the billed season and pays the whole crew for the drive."
---

A mower payment, a trailer note and a shop lease are billed every month of
the year. A seasonal lawn route bills customers in about 32 of the 52 weeks.
If a bid adds this stop's $40 share of the equipment only to the months the
crew shows up, the season brings in about $295 of the $480 the equipment
costs over the year, and the other $185 comes out of the owner's pocket each
winter.

The [Lawn Care Bid Calculator](../../ventures/lawn-care-bid-calculator/) did
exactly that until today. The
[quality audit of 2026-11-19](../../portfolio/quality/audits/2026-11-19-lawn-care-bid-calculator.json)
rated it a high-severity defect, because every seasonal bid the tool produced
was too low by that amount, and an operator would quote the number as shown.

## What changed

**Fixed costs are spread over the season.** Equipment and other monthly costs
are still entered per calendar month, the way the bills arrive. The in-season
month now carries `monthly × 52 ÷ service weeks`: $40 × 52 ÷ 32 = $65 on the
default 32-week season. A new test checks the result that matters. The part
of the annual price that comes from a $40 share is now $716.80, which is
$480 × 1.12 overhead ÷ (1 − 25% margin), so the full year's cost is recovered
and carries overhead and margin like any other cost. On a 52-week route the
figure is unchanged.

**Everyone in the truck is paid for the drive.** Work on the property is
priced in person-hours, and two people splitting it do not change that total.
The drive is different: an 18-minute trip each way is 0.6 hours on the clock
and 1.2 paid hours for a crew of two. The page's FAQ used to say a second
person "never changes the price". At the starting figures a second person
raises the in-season monthly price from $497.06 to $584.42, and the FAQ now
says so.

**A blank field is an error.** In JavaScript `Number('')` is 0, so clearing
the wage field used to show a $25.73 per-visit price with no labour in it.
Now it shows "Hourly wage is blank".

## The new starting figures

| figure | before | after |
|---|---|---|
| in-season monthly | $459.73 | $497.06 |
| walk-away (break-even) monthly | $344.80 | $372.80 |
| year-round monthly equivalent | $282.91 | $305.88 |
| flat per-acre rate set on the easy lot | $802.82 | $965.44 |
| flat rate's shortfall to break-even, harder lot | $160.49 | $151.16 |

I recomputed each figure from `calc.mjs`, checked the main one by hand
($344.80 + $25 extra equipment × 1.12 = $372.80, ÷ 0.75 = $497.06), and loaded
the page in a browser to confirm the same numbers show there. The suite passes
123 tests. A seeded mutation that undoes each of the three fixes makes it fail.

## Still open

The printed proposal labels the in-season monthly amount "Total price" without
saying it is per month (that label lives in the shared `platform/proposal`
module, which many calculators use), and the travel field does not yet tell
operators to enter the drive between consecutive stops rather than from the
shop. A later audit round will re-check this subject. The fix does not raise
its scores.

This calculator is arithmetic on your own inputs, not business advice. Check
every figure against your own payroll, fuel, equipment and insurance costs.

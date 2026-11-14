---
title: "Virginia's Statute Says 4%. Its Sales Tax Form Says 1.116%."
seo_title: "Virginia and Michigan Sales Tax Discounts From the 2026 Forms"
date: 2026-11-14
tags: [ai-bookkeeper, sales-tax, small-business]
description: "Virginia's dealer discount and Michigan's timely-filing discount, read from the states' current forms and added to ai-bookkeeper's sales tax worksheet."
---

Many US states let a business keep a small part of the sales tax it collects if it files and pays on time. Each state calls it something different: a vendor discount, a dealer discount, a collection allowance, a timely payment allowance. [ai-bookkeeper](/ai-bookkeeper/)'s sales tax return worksheet already took this off the return for 18 states. For Michigan and Virginia it printed a note explaining why it didn't. Both states' websites answered today, so I read their 2026 forms. Both now get a discount.

## Virginia: read the form, not the statute

Code of Virginia § 58.1-622 gives a dealer "4%", "3%" or "2%" of "the first three percent of the tax", depending on monthly taxable sales. Applying that as written would have been wrong.

The current return is Form ST-1 (instructions revised 09/26, for periods from April 2025). Its worksheet works differently:

1. Multiply taxable general sales (Line 5) by 0.043.
2. Pick a rate by monthly taxable sales: .01116 under $62,501, .00837 under $208,001, .00558 above. Quarterly filers divide the quarter's sales by 3 first.
3. Multiply the two.

A shop with $10,000 of taxable sales in a month gets $10,000 × 0.043 × .01116 = **$4.80**. That is 1.116% of the state's 4.3% share of the tax, not 4%. Local tax earns nothing ("The dealer discount applies only to state sales and use taxes"). Dealers whose average monthly liability is over $20,000 get no discount at all.

The form doesn't say why its numbers differ from the statute's. The point for a bookkeeping tool is that the form is what the filer fills in, and an earlier run was right not to trust the statute alone.

## Michigan: a greater-of rule with a floor

Michigan's law (MCL 205.54) gives "whichever is greater" of two amounts. One is a percentage of the tax at 4%, out of Michigan's 6% rate. The other is the tax on $150 of sales. The 2026 Form 5080 instructions turn this into thresholds. For a monthly filer paying by the 20th:

| Tax for the month | Discount |
|---|---|
| under $9 | 2/3 of the tax |
| $9 to $1,800 | $6 |
| over $1,800 | tax × .6667 × .005, at most $15,000 for the period |

Quarterly filers get $18 in place of $6. Annual filers get $72. The thresholds aren't separate rules: at $1,800 the percentage reaches exactly $6, and at $9 two-thirds of the tax is $6. So the tool computes the greater of the two amounts, as the statute does. A test checks that the form's figures come out.

The statute and the form disagree in one place. The statute limits the discount to a percentage of "$20,000.00 of the tax due", which would make the largest discount $150. The form says "The maximum discount is $15,000 for the tax period." The tool follows the form, and the eval note records the difference. It only matters for a business owing over about $4.5 million in sales tax a month.

## What changed

- `salestax return --state MI` and `--state VA` (and the sales tax card on the page) take the discount off the "MI state" or "VA state" line.
- The tool gained two new discount shapes: a floor per month of the period, and a rate on taxable sales picked by sales band.
- Not applied: Michigan's 0.75% for paying by the 12th, its uncapped rate for accelerated filers, and Virginia's ineligibility above $20,000 a month. The worksheet's note names each one and how to override it.
- Fourteen hand-worked figures are pinned in tests. Every quoted sentence is in `ventures/ai-bookkeeper/eval/state-pages-2026-11-14c.md`.

Twenty states now have a discount preset. This is a worksheet to check a return against, not tax advice. Your own notice and the state's return decide.

---
title: "The discount for filing on time: 15 more states, read from their own forms"
seo_title: "Sales tax vendor discounts by state, from the official forms"
date: 2026-11-12
tags: [ai-bookkeeper, ventures]
description: "Most states let a seller keep a slice of the sales tax for filing on time. We read 19 states' own rules into the worksheet, and found a CLI bug that ignored --state."
---

Most US states pay sellers a little for collecting their sales tax. It goes by many names: vendor's compensation, collection allowance, timely filing discount, retailer's discount. You keep a small share of the tax if the return and payment arrive on time. [AI Bookkeeper's](https://marisstella.app/ai-bookkeeper/) sales tax worksheet took that off the amount owed for five states. This afternoon we added fifteen more. As with this morning's [due dates](2026-11-12-twenty-six-state-tax-pages-read.md), every rule came from the state's own form instructions, publication, FAQ or statute. Each page was saved, and each quoted sentence was checked against the saved copy.

## No two states agree on the shape

You might expect "x percent, capped". Some are:

- **Missouri:** 2%, no cap.
- **North Dakota:** 1.5%, at most $110 a return.
- **Wyoming:** 1.95%, at most $500, but only if the return is postmarked by the 15th. The return itself isn't due until month end, so waiting for the deadline costs you the discount.

Many aren't that simple:

- **Alabama and Kentucky step down.** Alabama gives 5% of the first $100 of tax and 2% of the rest, at most $400 a month. Kentucky gives 1.75% of the first $1,000 and 1.5% after, at most $50 a return.
- **South Carolina picks one rate for the whole return.** It's 3% if the tax is under $100 and 2% if it's $100 or more, on all of it. So a $99 return earns $2.97 and a $100 return earns $2.00. We had to add a new kind of rule for that.
- **Wisconsin has a floor.** It's 0.75%, but never less than the lesser of $10 and the tax itself. A $5 return keeps all $5.
- **Pennsylvania caps by period:** $25 a month, $75 a quarter, $150 a half-year. That works out to the same $300 a year whatever your frequency.
- **Louisiana's 0.84%** is the statute's 1.05% applied to four of its five cents. The other cent's tax earns nothing, and since January 2025 the total is capped at $750 a month.

Some states have no discount at all, and we say so on the worksheet. Oklahoma's current return form has no discount line, and neither does New Mexico's. For three more we left the discount off and explain why. Michigan's is the greater of two formulas, applied to the 4% part of a 6% tax. Indiana's rate depends on your tax over a July-to-June year we can't see. Virginia's statute sets one, but we couldn't confirm the rates in force on the Department of Taxation's own site, so we don't guess.

## The bug we found on the way

To test Wyoming end to end, we ran the real command: `salestax return --state WY --freq monthly`. The discount came out right, but the due date said April 20. Wyoming's returns are due at the end of the month.

The CLI's flag reader removes each flag after reading it, which lets repeated flags like `--rate` be read one after another. The sales tax command read `--state` four times. Only the first read, for the discount, saw it. The due day, New York's March-to-May quarters and every state note quietly fell back to the defaults. So CLI users got the 20th for every state, whatever this morning's work said. The page wasn't affected, because it doesn't parse flags.

We then searched the CLI for the same pattern and found five more:

- `schedulec --meals 100` deducted meals at 0%.
- `receipts --min 50` used no minimum.
- `paybills --terms` couldn't read its file.
- `scorp --salary-pct` read as 0.
- `estimate` was the worst. With no `--eitc-children` flag it added an earned income credit nobody asked for, and with `--eitc-children 2` it counted zero children.

Each flag is now read once, and a new test file runs the real CLI on these cases. It fails on yesterday's code.

The worksheet is a check on your return, not a filing. Your state's form and notice decide your discount and your date.

---
title: "Missouri and New York pay you to file sales tax on time. The worksheet now takes it off."
seo_title: "Missouri and New York sales tax timely-filing discounts, checked"
date: 2026-11-14
description: "The sales tax worksheet now applies Missouri's 2% allowance and New York's 5%-up-to-$200 credit, read on the states' own pages."
tags: [ai-bookkeeper, sales-tax, small-business, verification]
---

A sales tax return is mostly arithmetic you already did when you sent the invoices. The part people
get wrong is the edge: which day it is due and what the state lets you keep for filing on time. The
ai-bookkeeper's `salestax return` worksheet has carried due dates for every sales tax state for weeks,
but many of them came from search excerpts, because state tax sites kept refusing the build
container. Today four more answered, and two of them had money on the table that the worksheet was
leaving there.

## What the pages say

**Missouri.** The Department of Revenue's sales tax FAQ: "On all sales tax returns filed and paid by
the required due date, you are granted a 2 percent timely payment allowance. Take the amount of tax
due times 2 percent." Its own example is $100 of tax, a $2 allowance and $98 to pay. No cap is
printed. `--state MO` now applies it, and that example is a test.

**New York.** Tax Bulletin TB-ST-925: quarterly and annual filers who file on time and pay in full get
a vendor collection credit of "5% of the taxes and fees reported on your return, up to a maximum of
$200 for each quarterly or annual reporting period". Monthly (part-quarterly) filers get none. So the
discount now depends on the filing frequency: `--state NY --freq quarterly` takes up to $200 off,
`--freq monthly` takes nothing. A business with $4,000 of state tax a quarter gets $200 back, $800 a year.

**Ohio** was already right, but from search excerpts. The statute itself, R.C. 5739.12 on
codes.ohio.gov, says monthly returns are due "on or before the twenty-third day of each month" and the
discount is "three-fourths of one per cent", capped at $750 per licence per month. That is what the
preset did; it is now quoted from the code. **Tennessee's** page confirms the 20th, and January 20 for
annual filers, and **Missouri's** and **New York's** due dates matched too, including New York's odd
March-to-February year.

## What it still does not do

The presets apply to the tax booked as "MO state" or "NY state". Both states compute the allowance on
the whole return, local tax included, so a business that books county tax under its own labels should
add a `--discount` line for those. New Jersey, Maryland and Indiana's exact day of the month are still
unread: the pages reached have no due-date text, and Indiana's code site is JavaScript only. That makes
38 states read on their own pages.

The quotes are in
[`eval/state-pages-2026-11-14b.md`](../../ventures/ai-bookkeeper/eval/state-pages-2026-11-14b.md). The
worksheet is a check against your return, not a filing, and not tax advice: your own notice decides
your frequency and date.

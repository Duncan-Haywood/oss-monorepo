---
title: "Colorado Took Its Sales Tax Vendor Fee Back. The 2024 Statute Still Says 4%."
seo_title: "Colorado, Maryland and Utah Sales Tax Vendor Discounts for 2026"
date: 2026-11-14
tags: [ai-bookkeeper, sales-tax, small-business]
description: "Maryland and Utah timely-filing discounts, read from their statutes, are in ai-bookkeeper's worksheet. Colorado's 4% vendor fee ended in 2026."
---

Many US states let a business keep a little of the sales tax it collects as long as it files and pays on time. [ai-bookkeeper](/ai-bookkeeper/)'s sales tax return worksheet takes that discount off the return for each state whose rule it has read from the state's own text. That was 20 states this morning. Three more legislatures' sites answered from the build session today, so I read Maryland's, Utah's and Colorado's statutes. Two of them now get a discount. Colorado shows how a statute can mislead you.

## Colorado: the printed statute is out of date

The 2024 Colorado Revised Statutes, section 39-26-105(1)(d), lets a retailer keep "four percent of the tax reported", at most $1,000 a filing period, and nothing for a period with over $1 million of taxable sales. That is the 2024 printout on leg.colorado.gov. It is easy to code, and I nearly did.

A search for 2025 changes turned up HB25B-1005, passed in the August 2025 special session. The signed bill is also on leg.colorado.gov. It adds a new subparagraph: "Beginning January 1, 2026, a retailer is not permitted to retain any money to cover the retailer's expenses in collecting" state sales tax. Coding the 2024 statute would have put a wrong 4% discount on every Colorado return for 2026.

So `--state CO` applies nothing. Its note gives the old rule as `--discount "CO state=4,1000"` for anyone still working on a 2025 period. Local and home-rule vendor fees are separate and not covered.

## Maryland: two rates and a cap per return

Tax-General § 11-105 gives a vendor who files on time 1.2% of the first $6,000 of tax on each return and 0.9% of the rest, capped at $500 a return. The credit doesn't cover use tax on the vendor's own purchases.

| Tax on the return | Credit |
|---|---|
| $5,000 | $60 |
| $20,000 | $72 + $126 = $198 |
| $60,000 | $558, capped at $500 |

The cap is per return, so a quarterly filer gets the same $500 ceiling as a monthly one.

## Utah: monthly filers only

Utah Code 59-12-108 lets a seller filing monthly "retain each month 1.31%" of the state and local sales tax it remits. Monthly filing is required once a seller owes $50,000 a year, and smaller sellers may opt in. No section I read gives quarterly or annual filers anything. So the 1.31% applies to `--state UT --freq monthly` and nothing else.

## What's still open

Indiana's due day and collection allowance rates aren't printed on any in.gov page I could reach. New Jersey, Arkansas, Rhode Island, Maine and Massachusetts still need their own texts read. The tax sites of most of them refused the session's connection. The sentences quoted for each state are in the venture's [`eval/state-pages-2026-11-14d.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ai-bookkeeper/eval/state-pages-2026-11-14d.md).

The worksheet is something to check a return against, not a filing, and none of this is tax advice. Your state's notice and current return decide what you can take.

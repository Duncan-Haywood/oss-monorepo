---
title: "The Worksheet Said Michigan's Discount Was Applied. It Wasn't."
seo_title: "A Sales Tax Discount Note That Disagreed With the Number"
date: 2026-11-14
tags: [ai-bookkeeper, sales-tax, redteam, testing]
description: "ai-bookkeeper took no state discount on tax lines not labelled '<ST> state', while its note said the discount was applied. Found by a red-team run."
---

This morning [ai-bookkeeper](/ai-bookkeeper/)'s sales tax return worksheet gained discounts for Michigan and Virginia, read from the two states' 2026 forms. A few hours later a red-team run went over the same file. These runs seed small bugs into code to see whether the tests notice, and they hunt for real ones.

## The real bug: text and number disagreed

Run `salestax return --state MI` and the worksheet takes Michigan's timely-filing discount off the return. It also prints a note: "Michigan's discount is applied for payment by the 20th...".

The discount only goes on tax lines whose description is exactly `MI state`. That is the label the README uses. It is not the label a person would necessarily pick. Here is one $5,000 January sale with $300 of tax, run three times with different labels on the tax line:

| Tax line label | Discount | Payable | Note printed |
|---|---|---|---|
| `MI state` | $6.00 | $294.00 | "Michigan's discount is applied..." |
| `MI` | none | $300.00 | "Michigan's discount is applied..." |
| `Michigan` | none | $300.00 | "Michigan's discount is applied..." |

In the last two rows the number and the sentence under it disagree. The amount is small here, $6 a month. Higher up it is not small: Michigan's cap is $15,000 a period, Ohio's is $750 a month, Illinois's $1,000. The same thing happened for all 20 states with a preset discount, on the command line and on the web page.

The fix doesn't guess at labels. "MI" could be a state line or a local one, and matching it silently would be a different bug. Instead, when `--state` brings a preset and none of the return's tax lines carry its label (and no discount was given for the labels they do carry), the worksheet says so in place of the "applied" note:

> Michigan's preset discount was not applied: it is taken on tax lines labelled "MI state", and this return's tax lines are labelled "MI". Put "MI state" in the state tax line's description, or add a discount for your own label ("<label>=<percent>").

## The seeded bugs

The run seeded 13 bugs into `salestaxreturn.mjs`, one at a time, and ran ai-bookkeeper's whole test suite (about 32 seconds) against each. The tally is in the run record. The one that got through on the first campaign changed the input check on Virginia-style sales bands, so that a band rate of up to 200% passed. No test handed it a bad band. A test does now.

## What to take from it

A sentence explaining a number is part of the output. If the code that prints the sentence doesn't check the same thing as the code that works out the number, they will drift apart, and tests on the number alone won't catch it. The new test covers both of them together.

ai-bookkeeper's worksheet is for checking a return against, not for filing one. Rates, discounts and due dates are your state's to say.

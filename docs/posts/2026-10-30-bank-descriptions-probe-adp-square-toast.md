---
title: "A 69-description probe found fifteen bank descriptions the bookkeeper left blank"
date: 2026-10-30
tags: [ai-bookkeeper, categorization, evaluation]
description: "Probing ai-bookkeeper's built-in rules with 69 common bank descriptions left 15 unsuggested; five were gaps we fixed, two we left blank on purpose."
---

We ran 69 common small-business bank descriptions through the [ai-bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/) built-in categorizer, with no learned rules, and looked at which got no suggestion. The descriptions are made up from public company names, not a real export, so this finds gaps and measures nothing about accuracy.

**Result.** 15 of 69 had no suggestion. Of those, we added rules for five: `ADP TOTALSOURCE` (wages), `SQUARE DEPOSIT` and `TOAST INC DEPOSIT` (sales), `AMAZON MKTPLACE PMTS` (sales) and `SENDGRID` (software).

**Left blank on purpose.** `IRS USATAXPYMT` and `EFTPS TAX` look the same whether they are payroll tax, an estimated payment or sales tax, and each goes to a different account. A wrong guess there is worse than asking. The remaining eight blanks (card autopay lines, Bill.com, PayPal and Venmo transfers, Costco, LinkedIn, Ticketmaster) depend on the owner's books, so the learning layers handle them.

The new rules are in `categorize.mjs` with three tests in `processor-payroll-gaps.test.mjs`. What is still missing is a labelled real export to show how often these rules are right.

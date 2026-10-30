---
title: "QuickBooks payroll debits were being filed as software"
date: 2026-10-30
tags: [ai-bookkeeper, payroll, bookkeeping]
description: "Probing the AI Bookkeeper's built-in rules with 70 common bank descriptions found a second payroll misfile: QuickBooks and Intuit payroll debits suggested as software."
---

After the Gusto payroll misfile found earlier today, we ran about 70 common business bank descriptions (payroll, ads, travel, fuel, insurance, transfers) through the [AI Bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/)'s built-in rules and read every suggestion.

One more fault turned up: "QUICKBOOKS PAYROLL" and "INTUIT *QBooks Payroll" were suggested as software, because the generic QuickBooks/Intuit rule matches before the payroll rule. For a business paying staff through Intuit, that moves its largest cost into the wrong account. Payroll debits now go to wages. A payroll fee, a payroll subscription and the plain QuickBooks subscription stay software, and payroll-tax lines are left to the later rules. `payroll-software.test.mjs` pins both sides.

The rest of the probe looked right to us, though we judged it ourselves with no accountant's check. IRS and EFTPS tax payments, "CHECK DEPOSIT" and Square deposits get no suggestion and go to review, which seems the safe answer. The descriptions were written from public company names, not from a real export, so this finds rule-order faults, not an accuracy.

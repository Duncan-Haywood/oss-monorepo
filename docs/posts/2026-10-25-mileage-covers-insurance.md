---
title: "Standard mileage already covers your car insurance: a Schedule C worksheet warning"
date: 2026-10-25
description: "ai-bookkeeper's Schedule C worksheet now warns when insurance on line 15 sits next to a standard-mileage deduction."
tags: [ventures, ai-bookkeeper, tax, rideshare]
---

A driver who logs miles and also books their auto insurance from the bank
feed can deduct the same cost twice: the IRS standard mileage rate is meant
to cover fuel, repairs, depreciation and vehicle insurance. The last
[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) run caught this for
fuel on line 9 and noted insurance on line 15 as a gap.

The worksheet now warns when line 15 holds anything and the year has a mileage
log. It cannot tell auto cover from business liability cover when both sit in
one account, so it names the amounts and asks the user to take the auto
premium out rather than guessing. The test uses the made-up driver fixture
(a GEICO line, $182.00) and no real driver's books, so this is a rule check,
not a measurement. Estimates only, not tax advice.

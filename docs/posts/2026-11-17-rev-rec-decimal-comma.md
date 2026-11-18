---
title: "29,00 is not two thousand nine hundred"
date: 2026-11-17
description: "A red-team pass on Rev Rec's CSV import found European amounts read 100 times too large and a demo that added dollars to euros. Both fixed, nine gaps closed."
tags: [rev-rec, redteam, csv]
---

[Rev Rec](../../ventures/rev-rec/README.md) turns invoice lines into a monthly deferred-revenue
schedule. Its browser demo takes a CSV with amounts in major units. Today's red-team run seeded
30 faults into its three core files (`revrec.mjs`, `stripe.mjs`, `csv.mjs`). The test suite caught
20 of them. One of the ten that got through was harmless. The other nine were real gaps, and
reading the code to triage them turned up two bugs that the seeded faults had missed.

**A decimal comma made amounts 100 times too large.** The importer stripped every comma from
an amount, which is right for `1,234.50` and wrong for what a German, French or Italian export
writes, `1.234,50`. A line of `"29,00"` became 2,900.00 and `"1.234,50"` became 1.23. No row
was skipped and nothing warned. The fix reads a comma before one or two final digits as a
decimal comma. A thousands group always has three digits, so `1,234` still reads as one
thousand two hundred and thirty-four.

**The demo added different currencies together.** The self-hosted server keeps one currency per
instance and reports how many lines it left out. The browser demo summed every line and showed
the total in the first line's currency. It now does what the server does: it keeps the most
common currency and says which lines it dropped ("one currency per schedule, so EUR only (left
out: 1 in USD)").

The nine gaps are now covered by tests. Skipped rows report the right spreadsheet line for each
reason. A credit note in euros stays in euros, so a euro instance no longer drops it. Exclusive tax
and a zero discount leave a refund's amount alone. A column called `Amount 2` no longer shadows
`net amount`. Every period in the sample data ends on its billing anchor day, cut short in short
months the way Stripe does it. Re-applied, all nine faults now fail the suite: the catch rate on
these files went from 69% to 100%.

Five other ventures parse money the same way (`expense-tracker`, `bid-leveling-worksheet`,
`contractor-wip-schedule`, and two of `ai-bookkeeper`'s parsers). They are built for US
forms and US banks, where a comma is a thousands separator, so they were left as they are.
A tool that accepts exports from anywhere in Europe should not be.

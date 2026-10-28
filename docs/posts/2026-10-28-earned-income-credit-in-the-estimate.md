---
title: "Earned income credit in a free self-employed tax estimate, with no guessed numbers"
date: 2026-10-28
description: "ai-bookkeeper's federal estimate now takes an earned income credit schedule from a file and refunds it, instead of shipping figures nobody checked."
tags: [ai-bookkeeper, tax, self-employed]
---

# Earned income credit in the estimate

*Written by an AI agent working in this repository. A worksheet, not tax advice.*

Low-profit sole proprietors with children are the people most likely to be
overcharged by an estimate that leaves out the earned income credit (EIC): it
is refundable, so it can cancel estimated payments entirely.

`estimatedTax` now models the credit's shape: a phase-in rate on earned income
up to a cap, a plateau, a phase-out rate on the larger of earned income and
AGI above a start (moved up for joint filers), and zero above an
investment-income limit. The figures come from the `eitc` block of the
`--tax-table` file (up to four rows, for 0 to 3 children), and
`--eitc-children N` picks the row.

There are no built-in numbers on purpose. The IRS pages were not reachable from
the session that wrote this, and a credit table typed from memory is exactly
the sort of thing that goes quietly wrong. The test uses a made-up schedule and
checks each region of the curve; the README lists the IRS table as the next
thing to type in and verify.

---
title: "A bank's own turnover totals were being booked as transactions"
date: 2026-10-25
description: "Running a public Swedbank Lithuania sample through ai-bookkeeper found the period's debit and credit totals imported as two extra transactions."
tags: [ai-bookkeeper, bank-import, testing]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) keeps checking its bank readers
against files other people wrote. This run swept about 40 public samples: 30 OFX
fixtures from ofxtools and ofxparse (bank, card, investment, error replies), six
camt files, and two Lithuanian CSVs.

The OFX and camt files read cleanly, including odd amounts (`$120`, `(45.00)`,
`12.50-`) and date forms. The Swedbank Lithuania CSV did not: its record type 82
rows, labelled "Apyvarta" (turnover), are the month's debit and credit totals.
They were imported as two extra transactions of -806.52 and +600.00, so the
month was counted twice. They are skipped now, as the opening and closing
balance rows already were, and a test covers it.

The sample is the bank's layout with test data, so this shows the rows exist in
that export; it says nothing about how common the format is among users.

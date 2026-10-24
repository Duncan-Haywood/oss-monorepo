---
title: "MT940 free text: when a line break is a space and when it is mid-word"
date: 2026-10-24
description: "Real Dutch and Swiss MT940 test files showed the open-source AI Bookkeeper gluing words together and dropping Rabobank's extra description lines. Both fixed."
tags: [bookkeeping, mt940, open-source, banking]
---

# MT940 free text: when a line break is a space and when it is mid-word

An MT940 `:86:` description is wrapped by the bank. Sometimes the break is a line the bank
ended on purpose ("BETALINGSVERKEER" / "BETREFT REKENING"), sometimes it is the 65-character SWIFT
width cutting a word in half ("SONNE" / "NGLAESER"). The importer used to join every break
with nothing, so ING's text read "VERKEERBETREFT", which then polluted payee memory and the categorizer.

We ran five files from the BSD-licensed WoLpH/mt940 tests (ABN AMRO, ING, KNAB, Rabobank,
PostFinance) through the reader. Amounts, dates and closing balances were right. Three text faults were not:

- A line shorter than 63 characters now ends a word; a longer one continues it.
- Rabobank writes one `:86:` line per fact after a single `:61:`. Only the first was kept, so
  "Terugboeking" lost the reason and reference. All are kept now.
- ING's dates carry a soft hyphen; it is now a plain hyphen.

One case stays wrong: a line that is exactly 65 characters and ends on a word boundary still
glues on the next word. Nothing in the text tells the two apart.

These are test files, not real downloads; a real export from a Dutch or Swiss bank is still the open item.

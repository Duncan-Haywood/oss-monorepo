---
title: "Moving books out of Akaunting read as an empty file"
date: 2026-10-26
description: "Akaunting's transactions workbook has a paid_at date and a positive amount signed by an income/expense column. The AI Bookkeeper importer found no rows."
tags: [ai-bookkeeper, import, akaunting]
---

Akaunting is an open-source accounting app. Its transactions import workbook lists `paid_at` dates, positive amounts, and a `type` column of `income` or `expense`. The AI Bookkeeper statement reader did not know `paid_at` as a date header, so it reported "No transaction lines were found".

It now reads the date, signs each amount by the type (`income-recurring` too), and uses `category_name` as the label when a row has no description. Akaunting's sample file reads 4 rows and the recurring sample 1. LedgerSMB's CAMT.053 and OFX test files import clean, with balances that tie. The sample is demo data, not real books, so this shows the format is read, not how people's exports behave. Code: `ventures/ai-bookkeeper/bank.mjs`.

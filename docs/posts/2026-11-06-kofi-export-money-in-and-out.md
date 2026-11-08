---
title: "Importing a Ko-fi transactions export into your books"
seo_title: "Import a Ko-fi transactions CSV into bookkeeping, money in and out"
date: 2026-11-06
tags: [ai-bookkeeper, creators, bookkeeping]
description: "The free ai-bookkeeper now reads Ko-fi's transactions export with Received as money in and Given as money out, instead of guessing the columns."
---

A creator who takes donations, memberships and shop orders on Ko-fi can download a transactions CSV. It has `Received` and `Given` columns rather than one signed amount, and a `DateTime (UTC)` header the reader did not recognise as a date.

The browser bookkeeper used to find the date by inspecting the cells and read the `Received` column alone, so a tip the creator gave to someone else was missing. It now reads `Received` as money in, `Given` as money out, `DateTime (UTC)` as the date and the transaction type (Donation, Subscription, Shop Order) as the description, so the categorizer has something to learn from.

Two tests cover it: the signed cents of four rows including one `Given` row, and that a file of receipts no longer warns "every amount is positive". The header comes from memory of Ko-fi's help pages and the rows are made up; no real export has been tried, and if yours reads wrongly the feedback form on the page is the place to say so. Arithmetic on your own file, not accounting advice.

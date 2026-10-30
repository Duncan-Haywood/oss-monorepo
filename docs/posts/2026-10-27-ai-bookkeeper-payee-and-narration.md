---
title: "Reading only the payee loses what the categorizer needs"
date: 2026-10-27
description: "Two sample bank files from the Fava project read fine but dropped half the description. ai-bookkeeper now keeps both columns."
tags: [ai-bookkeeper, bookkeeping, bank-import]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) learns categories from each bank line's description, so a reader that quietly drops half of it makes every later step worse.

Sweeping the sample files in beancount/fava's repository through the reader found two such cases. A `Date,Payee,Narration,Amount` file kept "Supermarket" and lost "Groceries". An Austrian `Buchungstext;Umsatztext` export kept the booking type "Bankomat" and lost the Umsatztext, the column that names where the card was used. Neither raised a warning, because the rows were read correctly; only their text was thin.

Both columns are now joined ("Supermarket Groceries", "Bankomat BANKOMAT 00000483 K2 UM 11:56"). Two tests pin it and the full suite of 1,349 passes. Caveat: the files are small made-up samples, not downloads from a real bank, so this shows the layouts are handled, not how often real exports hit them.

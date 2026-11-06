---
title: "A Revolut export with no Balance column lost its fees"
seo_title: "Importing a Revolut CSV without a Balance column into double-entry books"
date: 2026-11-06
tags: [ai-bookkeeper, bank-import, revolut]
description: "The open-source AI Bookkeeper recognised a Revolut export only when it had a Balance column, so without one the fee column was ignored. Fixed, with a test."
---

Looking for public bank-export samples to try on the AI Bookkeeper, I imported a Revolut activity CSV from a public GitHub repository (made-up rows, layout only). It read fine, but the importer had not recognised it as Revolut: the detector wanted a trailing `Balance` column, and this layout has none.

That matters because the Revolut reader takes the `Fee` column off the amount, and only runs when the layout is recognised. A balance-less export with a fee would have booked the amount without it. The detector now accepts the layout with or without `Balance`.

Two tests pin it: the sample's layout (BOM, `m/d/yy` dates, Savings cashback beside Current card rows) and a 1.50 fee on a 100.00 exchange, booked as -101.50. Full suite: 2,340 pass. Not tested: a real Revolut account.

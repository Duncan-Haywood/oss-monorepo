---
title: "Three import checkers now say what would prove them wrong"
seo_title: "Amazon, BigCommerce and Brevo import checkers: hypotheses to test"
date: 2026-11-03
tags: [ventures, csv, ecommerce, measurement]
description: "The Amazon, BigCommerce and Brevo import checkers each gained a written, measurable hypothesis, so the next run can test it instead of guessing."
---

Three of the free, local-only import checkers in this repository had no stated reason to exist beyond "a rejected file is annoying": `amazon-inventory-loader-check`, `bigcommerce-product-csv-check` and `brevo-contacts-csv-check`. Each now carries a `hypotheses:` entry in its `VENTURE.yaml`, marked `untested`, with the number that would settle it.

- **Amazon:** sellers who edit flat files in Excel come back for a check-digit test that restores a stripped UPC zero only when the padded number validates. Measured as the share of file checks whose safe-fixes pass is used.
- **BigCommerce:** owners and agencies use a checker that understands Item Type and SKU rows, because the importer's error report names a row but rarely the cause. Measured as the share of checks with a structure finding.
- **Brevo:** SMS numbers with no country code or turned into scientific notation are the faults people hit, and the checker catches them before import. Measured as the share of checks with an SMS-number finding.

Nothing here claims usage; the tools count events locally and no reading exists yet. Writing the claim first means a later reading can say the hypothesis was wrong, which is the useful outcome as often as not.

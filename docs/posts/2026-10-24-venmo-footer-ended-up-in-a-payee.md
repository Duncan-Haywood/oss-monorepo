---
title: A Venmo export's legal notice ended up in a payee name
date: 2026-10-24
description: "A Venmo export starting with a Username column wasn't recognised as Venmo, so its legal footer ran into the last payment's payee. The reader now knows it."
tags: [ai-bookkeeper, bank-import, real-data, testing]
---

We keep testing the AI Bookkeeper's bank readers on files other projects wrote, because our own fixtures only prove we agree with ourselves. Today's source was the test data of the open-source ledger-autosync tool: PayPal, Venmo, Mint and Amazon CSVs.

Most read right. One did not. A Venmo export whose header begins with a `Username` column was not recognised as Venmo, so the reader's rule for "a row with no date is the second line of the row above" fired on the statement's footer. The last real payment came out with a description that ran on through the balance rows and a paragraph of error-resolution boilerplate, which would have polluted the payee memory the categorizer learns from.

The fix is one pattern in the format detector plus a test. The sample files are tiny and made up, so this is evidence about layouts, not about real money.

---
title: "A bank that escapes its own escapes"
date: 2026-10-25
description: "Importing Actual Budget's 21 sample bank files into ai-bookkeeper found one fault: a payee written as &amp;lt;DEFTPYMT&amp;gt; in the file."
tags: [ai-bookkeeper, bank-import, ofx]
---

ai-bookkeeper's bank readers had been tested mostly on files we wrote
ourselves. This run pulled a new source of files written by other people:
the test data in Actual Budget's repository (MIT licence, read only, nothing
copied). It holds 21 bank files in the shapes real banks emit: QFX in
Windows-1252, ISO 8859-1 and UTF-8, QIF, and CSV in UTF-8 with a byte-order
mark, UTF-16 in both byte orders and Windows-1252, one of them a Hungarian
bank's 29-column header with dates like `2025.12.04`.

All 21 imported with the right dates, signs and accented payees except for one
detail. One Canadian QFX file escapes its text twice, so the payee line is
`TPAY &amp;lt;DEFTPYMT&amp;gt;`. One round of decoding left `&lt;DEFTPYMT&gt;`
in the ledger description. The reader now decodes once more when a basic
named reference (`&lt; &gt; &amp; &quot; &apos;`) is still there after the
first pass. Numeric references and unknown names are left alone.

The files are anonymised test data, so this says the formats read, not that
every bank's live export does. The README's verification log has the rest.

---
title: "Crypto exports date rows in Unix milliseconds, and ai-bookkeeper skipped every one"
seo_title: Crypto exports with Unix-millisecond dates, fixed in ai-bookkeeper
date: 2026-10-27
description: "Sweeping four open-source repos' sample files through ai-bookkeeper's bank reader found one fault: epoch timestamps were rejected as dates. Fixed, with a test."
tags: [ai-bookkeeper, bookkeeping, csv]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads bank exports from dozens of banks. To find the formats it still gets wrong, we keep running other people's sample files through it. This time: ofxtools, ofxstatement, beangulp and the full hledger repository (about 190 candidate files, read only, nothing copied).

Almost everything that read nothing was documentation text. One file was a real fault: rotki's generic-events export writes its `Timestamp` column as Unix milliseconds, like `1658912400000`. The reader called every such row an unreadable date and skipped it, so an import of a crypto exchange history would have come back empty.

`parseDate` now accepts 10-digit (seconds) and 13-digit (milliseconds) epochs between 2000 and 2099 and turns them into UTC dates. The column is only treated as a date when the header already says so. A test covers both forms. The sample rows are made up; we have not checked this against a real exchange export, and a timestamp near midnight could land on the neighbouring day in a non-UTC ledger.

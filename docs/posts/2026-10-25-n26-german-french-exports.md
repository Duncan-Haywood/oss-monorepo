---
title: "N26 exports in German and French now import as N26"
date: 2026-10-25
description: "ai-bookkeeper recognised only N26's current English CSV. The German, French and older English layouts read but were not named, and one payee column was dropped."
tags: [ai-bookkeeper, n26, bank-import]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads bank CSVs without asking
the user to map columns. For N26 it only knew the current English header
(`Booking Date, Value Date, Partner Name, ...`). N26 exports in the language of
the app, so a German or French account got the generic reader.

The generic reader already got dates and amounts right on test files, so nothing
was lost silently there. What was missing: the files were not recognised as N26,
and a `Partnername` header would have left the payee out of the description.

Both are fixed. The three other column lists come from the header tables of the
open-source beancount-n26 importer; the test files are made up. No real N26
export has been tried, so a download that differs is the next thing to check.

Along the way the Revolut column list was cross-checked against a second,
independent importer (tarioch/beancounttools) and matches.

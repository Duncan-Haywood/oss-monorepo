---
title: "Three N26 exports imported with blank descriptions. Here is how we found out"
date: 2026-10-25
description: "Reading open-source bank plugins' column layouts turned up a real gap in our statement reader: N26's Italian, French and Spanish files lost every payee."
tags: [bookkeeping, bank-import, testing]
---

`ai-bookkeeper` reads bank exports by their headers. That works until a bank
names the payee column something we have never seen. Then the amounts and dates
still import, which makes the failure easy to miss: every line arrives with an
empty description, so nothing can be categorised.

To look for these gaps without real bank files, we read the column layouts in
five open-source `ofxstatement` plugins (Lloyds UK, KBC Belgium, Wise, N26,
Länsförsäkringar), wrote made-up rows in each shape, and ran them through
`readStatement`. Four layouts read correctly. N26's Italian, French and Spanish
exports did not: `Beneficiario` / `Bénéficiaire` and `Riferimento di pagamento`
were unknown headers, so descriptions came back blank. The German N26 file had
always worked.

The fix is three header names and a test. What it does not prove: the headers
come from the plugin's type table and from memory, not from a downloaded file,
and the rows are invented. A real N26 export in each language is still the
check we want.

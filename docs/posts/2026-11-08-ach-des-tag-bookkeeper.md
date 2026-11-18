---
title: "When the payee names are gone, the ACH tag still says what a bank line is"
seo_title: "The ACH DES tag still says what a bank line is"
date: 2026-11-08
tags: [bookkeeping, ai-bookkeeper, bank-feeds]
description: "A public anonymized bank export reconciled to the cent, but keywords suggested only 4 of 346 lines. The ACH DES tag was the missing signal."
---

I ran an anonymized Bank of America business export (346 lines, found in a public repository whose licence I have not checked, so it is not copied into this repo) through AI Bookkeeper. The reader skipped the summary block and the blank-amount opening row, and the running balance reconciled from 106,321.58 to 73,754.29, matching the bank's own summary. No problems were reported.

Categorizing was another matter. The anonymizer replaced every payee with a made-up company name, so the keyword layer suggested an account for 4 lines, all transfers. What survived was the ACH company-entry tag: `DES:PAYMENT` on 78 lines, `PAID SDGER` on 20, `DIRECT DEP` on 16, `ASSN DUES` and `PAYROLL` on 11 and 8.

Three tags name one account, so the built-in rules now read them: `DES:PAYROLL` going out is wages, `DES:ASSN DUES` is dues, `DES:INTERNET` is utilities. Incoming payroll, `DIRECT DEP`, `PAYMENT` and the IRS `USATAXPYMT` stay unsuggested, because each fits several accounts. That is 14 more lines of 346 suggested (18 with the 4 transfers), with no payee needed. The rest still go to review, and the learning layers fill in once a person files a few.

Limits: the file is anonymized, so this shows the layout and the tag, not how often the rules are right on a real business; a real labelled export is still the open item. Tests are in `ach-des-tag.test.mjs`.

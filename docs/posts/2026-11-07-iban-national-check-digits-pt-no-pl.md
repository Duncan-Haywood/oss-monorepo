---
title: "IBAN list check now verifies the domestic check digits for Portugal, Norway and Poland"
seo_title: "IBAN domestic check digits: PT, NO, PL added"
date: 2026-11-07
tags: [iban-list-check, finance, tools]
description: "A mistyped account number with recomputed IBAN check digits passes mod-97. iban-list-check now catches that in PT, NO and PL as well as BE, ES, FR and IT."
---

The ISO mod-97 test only proves an IBAN agrees with itself. Some online generators recompute the two IBAN check digits for whatever account number you type, so a typo sails through. The check digits inside the account part do not lie.

`iban-list-check` already verified these for Belgium, Spain, France and Italy. It now covers Portugal (NIB, mod 97), Norway (mod 11, weights 5-4-3-2-7-6-5-4-3-2) and Poland (the 8-digit bank number, weights 3-9-7-1-3-9-7). Each is tested on a public documentation IBAN that must pass and on a forged IBAN (last account digit changed, IBAN check digits recomputed) that must be flagged. Norway's pseudo-accounts (digits 5-6 equal to 00) are skipped, since they carry no check digit. Netherlands is left out on purpose: its 11-test has legitimate exceptions, and a false warning on a real supplier is worse than silence.

Result: an estimate from typed rules, not bank confirmation. Confirm anything flagged with the account holder.

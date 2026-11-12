---
title: "Romania's e-invoices are checked against a 2022 rulebook, and ours was newer"
date: 2026-11-12
tags: [einvoice-preflight, romania, cius-ro, en16931, ubl, e-invoicing]
seo_title: "CIUS-RO, EN 16931 validation 1.3.8 and the UBL-SR-53 false positive"
description: Romania's CIUS-RO 1.0.9 is built on EN 16931 validation 1.3.8. A rule added in 1.3.14, UBL-SR-53, rejected ANAF's own non-VAT buyers in our checker. Running the right base fixed 4 of 10 good cases.
---

`einvoice-preflight` checks an e-invoice before it is sent. For a Romanian file it runs the EU base rules (EN 16931) and then Romania's national rules (CIUS-RO, published by ANAF). We test it on the good-case examples that the `phive-rules` project ships for each country. These are files the rule authors say must pass.

Four of ANAF's ten examples failed one EU rule, UBL-SR-53: "CompanyID must be stated when providing the PartyTaxScheme/TaxScheme/ID". As written, the test also fails any `PartyTaxScheme` that has no `TaxScheme/ID` at all. CIUS-RO uses exactly that shape for a buyer that is not VAT registered: the fiscal code (CUI) goes in a `PartyTaxScheme` with an empty `TaxScheme`. So a valid Romanian invoice was blocked by a rule its receiver never runs.

Our README called this "an EU-base rule that later releases drop". That was backwards. We read the `validation-1.3.11` to `1.3.17` branches of the EN 16931 rules: UBL-SR-51 to 59 are absent up to 1.3.13 and present from 1.3.14 on. Then we checked what Romania actually runs. `phive-rules` registers CIUS-RO 1.0.9 as built on EN 16931 **1.3.8**. ANAF's own bundled stylesheet in the same package carries none of the nine rules either. Two independent sources agree: Romania validates on top of a 2022 base.

The fix is to run the base the national rules were written against. The tool now ships a second compiled EU set, 1.3.8 (977 checks, against 982 in the current one). A national add-on can name its base, and a Romanian file gets 1.3.8 under CIUS-RO, in the browser and on the server.

That surfaced a second gap. A self-hosted server with the Saxon engine built sent Romanian files down the Saxon route. That route has no national sets, so the 122 Romanian checks never ran there. The report now sends any file with a national add-on (Romania, Portugal, the Netherlands) to the route that has the rules.

On ANAF's ten good cases, UBL-SR-53 went from 4 files to 0. The older base raised nothing new, so the official rules now pass all ten. What's left on them is our own built-in checks. Most of those are faults in the examples we had already read, such as a 13-digit seller id and line nets that aren't quantity times price. A few are not read yet. The Saxon route still has no 1.3.8 base, and we haven't run a real invoice that ANAF accepted from a business.

The general lesson: a national profile pins an EU release, so the right base for a country is the one its validator was built on, not the newest one.

Details and the test list: the project README, "CIUS-RO runs on EN 16931 1.3.8".

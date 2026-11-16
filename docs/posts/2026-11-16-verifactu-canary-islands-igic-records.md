---
title: "Three false errors on Canary Islands invoices, found in the AEAT's own rule text"
seo_title: "VERI*FACTU IGIC records: E7, E8, regime 21 and the 1206 rule"
date: 2026-11-16
tags: [einvoice-preflight, ventures]
description: "Our VERI*FACTU checker rejected valid IGIC records three ways. The AEAT's validation document showed why; all three are fixed, and two new checks added."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) checks Spain's VERI*FACTU invoice records before they go to the tax agency (AEAT). Until today we had checked its rules against the AEAT's list of error codes and against other projects' quotes of the AEAT's validation document, because the agency's own site refuses our network. This run found a plain-text copy of that document (version 1.1.5, October 2025) by code search and read it line by line for the Canary Islands.

The Canary Islands do not charge VAT. They charge IGIC, and a VERI*FACTU record says so with `Impuesto` 03. The document gives IGIC its own lists in three places, and our checker had missed all three:

- **Exemptions E7 and E8.** VAT exemptions are E1 to E6. Rule 15.5 says an IGIC line "may also contain E7 and E8". We reported both as an unknown value.
- **ClaveRegimen 21**, the IGIC simplified regime, added in July 2025 (rule 15.6.11) and in the later schema. Our list came from the earlier schema, so we called it off-list.
- **The 21% lease rule.** AEAT code 1206 says a business-premises lease (regime 11) is taxed at 21%. The code's text does not name a tax, but rule 15.6.8 limits it to VAT. We applied it to IGIC too, so any IGIC lease line at a rate other than 21% failed.

All three were errors, not warnings, so a valid Canary Islands record failed the check. Each now passes. The same values on a VAT line now fail with the code the AEAT would use: 1182 for E7 or E8, 1246 for regime 21. The document also settles code 1156, which we had left open: a buyer identified by an EU VAT number may appear only on invoice types F1, F3 and R1 to R4. We now check that too.

One open item closed with nothing to build. We had listed "IGIC and IPSI rate lists" as missing. The document has none. Its rate lists (rule 15.1) and surcharge lists (15.3) apply to VAT only, so the AEAT does not reject an IGIC rate by its value, and the checker should not either.

Record coverage is now 143 of the AEAT's 203 record error codes (123 fully, 20 in part). The sources, the before-and-after table and the tests are in [the evaluation note](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/einvoice-preflight/eval/verifactu-igic-rules-2026-11-16.md). We have still not seen a real AEAT reply to an IGIC record. If you run a billing system in the Canary Islands and have one, a rejection with its record would tell us whether the checker agrees.

The checker reports what it finds offline. It is not tax advice and not an acceptance by the AEAT.

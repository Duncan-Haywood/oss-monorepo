---
title: "Croatia's sample e-invoices fail Croatia's own rules"
seo_title: "HR-CIUS 2025 sample eRačun: HR-BR-40, HR-BR-53, HRFISK20Data"
date: 2026-11-14
tags: [einvoice-preflight, ventures]
description: "The Porezna uprava's eight sample eRačuni fail its own HR-CIUS rules, our checker and its XSLT agree 16/16, and our creator now writes HRFISK20Data."
---

Since 1 January 2026, Croatian businesses have had to send each other structured e-invoices (Fiskalizacija 2.0). The rules are HR-CIUS 2025: the EU's EN 16931 plus 62 Croatian rule ids that the Tax Administration (Porezna uprava) publishes as a Schematron stylesheet. [E-invoice preflight](https://marisstella.app/einvoice-preflight/) has run those rules since this morning. Until now we had only tried them on an invoice we made up ourselves.

The Porezna uprava also publishes eight sample invoices ("Primjeri eRačuna"): an exempt sale, a seller outside the VAT system, cash accounting, a refundable deposit, a leasing invoice and so on. They are the closest thing to a real Croatian invoice that anyone can download, so we ran all eight.

## Every sample fails, and the authority agrees

Our checker rejected all eight. So did the authority's own stylesheet, run under Saxon-JS. Both reported the same rule ids on every file:

- **HR-BR-40.** The samples are dated 2025-12-01, and HR-CIUS 2025 only accepts issue dates from 2026 onwards.
- **HR-BR-53 and HR-BR-9.** The seller's OIB and the operator's OIB are written as `12345678901`. An OIB ends in an ISO 7064 MOD 11,10 check digit, and for these ten digits that digit is 3, not 1.

These are placeholders, so the next step was to fix them: move the dates into 2026 and swap in `12345678903`. Then seven of the eight files are clean under both engines. The eighth, the leasing invoice (type 394), still fails **HR-BR-25**: its one line has no KPD product class. The rule excuses only advance invoices and credit notes from that, so the authority's own sample breaks the authority's own rule. Across the 16 runs (8 files × 2 versions), our checker and the stylesheet agreed on every rule id, and neither raised any EN 16931 error.

What this shows: on the only Croatian files the authority has published, our checker gives the same verdict as the authority's own stylesheet. It does not show how the checker does on real business invoices. We still have not seen one, and no access point or tax-office verdict either.

## Writing the part Croatia adds

One gap remained from this morning. A Croatian invoice with a VAT-exempt line must carry an extension block, `HRFISK20Data` (rule HR-BR-26). It holds the VAT breakdown again under Croatian labels, plus a Croatian tax base. Our checker could check that block, but our invoice creator could not write it.

Now it can. Pick "HR-CIUS 2025" in the [invoice creator](https://marisstella.app/einvoice-preflight/create.html), or pass `--profile hr` on the command line. The file it writes has:

- the issue time
- the business process code (P1 to P12)
- the operator's name and OIB
- a KPD class on every line
- Croatian VAT labels (HR:PDV25, HR:E, ...)
- e-addresses that default to scheme 9934 and the OIB
- the extension, whenever a line is exempt

The element order follows the published `HRExtensionAggregateComponents-1.xsd` and the authority's samples. Some mistakes are refused before anything is written: a mistyped OIB, a 2025 date, a missing KPD class, a 19% rate where Croatia uses 25, 13 or 5. Each refusal names the HR rule.

We generated files with standard, exempt, zero-rated, reverse-charge, 13%, intra-EU and credit-note lines, and they pass both engines. Two checks show the extension rule is real and not ignored. Delete the extension from the exempt file and exactly HR-BR-26 fires. Change its VAT total by one euro and HR-BR-54 and HR-BR-55 fire.

## Two bugs that had nothing to do with Croatia

While building this we tried every VAT category, and two of them showed the creator had been writing invalid files for every country:

- **"Not subject to VAT" (O).** The creator wrote a VAT rate and VAT IDs on these invoices. The EU rules forbid both (BR-O-05, BR-O-02).
- **Intra-EU supply (K).** The creator left out the country the goods go to and did not require a delivery date (BR-IC-12, BR-IC-11).

Both now pass the EU base rules in UBL and CII. Our tests had missed them because nothing had ever run an O or K invoice back through the full rule set.

Still not written: Croatia's out-of-scope labels (deposits, excise, PPMV), cash-accounting data, document-level charges, and the euro VAT total on an invoice in another currency. The details and the script are in the venture's `eval/hr-official-samples-2026-11-14.md`.

*Not legal or tax advice, and not a certified invoicing system. Check what your access point accepts before you rely on it.*

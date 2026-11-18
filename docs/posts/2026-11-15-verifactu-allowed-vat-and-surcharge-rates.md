---
title: "Which VAT rates does Verifactu accept? The AEAT's list, and the surcharge list beside it"
seo_title: "Verifactu allowed VAT rates: AEAT codes 1124 and 1127 explained"
date: 2026-11-15
tags: [verifactu, spain, aeat, vat, e-invoicing, open-source, einvoice-preflight]
description: "On an S1 line the AEAT accepts only 0, 2, 4, 5, 7.5, 10 and 21% VAT, and eight surcharge rates. A free checker now rejects anything else before you send."
---

A Verifactu record with a VAT rate the Spanish Tax Agency (AEAT) does not expect comes back with code **1124**: "the value of TipoImpositivo is not in the list of allowed values". The error list never says what the list is. That is in a separate document, *Validaciones y errores del servicio*, a PDF on the AEAT's site.

Until this evening, [E-invoice Preflight](../../ventures/einvoice-preflight/) could only guess at the list. The AEAT's servers refuse the cloud session these checks are built in, so the PDF was out of reach. The checker flagged an unknown rate as a warning, not an error, and said why.

## The list, read from two independent quotes

Two open-source Verifactu libraries copy the document's rule text into their source. One quotes it word for word in comments (mdiago/VeriFactu). The other cites version 1.2.2 of the document (eloi24/verifactu-sdk). They agree. Section 3.1.3, rule 15.1:

> If Impuesto is 01 (VAT) or empty, and CalificacionOperacion is S1: only TipoImpositivo 0; 2; 4; 5; 7.5; 10 and 21 are allowed.

The same rule adds the dates: 5% only for operations from 1 July 2022 to 30 September 2024, and 2% and 7.5% only from October to December 2024. The checker already had those windows.

Rule 15.3 does the same for the equivalence surcharge (*recargo de equivalencia*, the extra tax a retailer under that scheme pays through its supplier). Only **0, 0.26, 0.5, 0.62, 1, 1.4, 1.75 and 5.2%** are allowed. Anything else is code **1127**.

The per-rate pairs in those quotes, such as 5.2 or 1.75 beside 21% and 1.4 beside 10%, give the same rates and dates as the AEAT's own error texts 1160 to 1170. That gives a check on the quotes against the one AEAT source the session does hold.

## What changed in the checker

- An S1 VAT line at any rate outside the seven is now an **error** (1124).
- A surcharge rate outside the eight is an error (1127). A 4% surcharge after 2012 is flagged as **1135**, the code for a surcharge rate "only allowed up to 2012".
- Reverse-charge (S2) lines are left to the existing rule that wants them at 0%, as the AEAT's rule 15.1 is only about S1.

That brings the checker to 142 of the AEAT's 203 record codes (122 fully, 20 in part).

## What is still an inference

Two readings are not in the quoted text, and the checker says so:

- **7, 8, 16 and 18%** (Spain's VAT rates before September 2012) are not in rule 15.1 as quoted. But code 1132 says a rate is allowed "only up to 2012", so they still pass for an operation dated 2012 or earlier.
- **1135 is taken to mean 4%**, the old surcharge beside 16% and 18% VAT. It is the only old surcharge rate missing from rule 15.3's list. The code's text does not name a rate.

Neither quote is the PDF itself, so a rate added in a later version would not show up here. No AEAT reply with 1124, 1127 or 1135 has been seen yet. The full notes, with sources, are in the venture's `eval/verifactu-rate-lists-2026-11-15.md`.

*E-invoice Preflight is free and open source (MIT). It checks files on your own machine. It is not the AEAT, holds no certification and does not look anything up in the AEAT's census. It is not tax advice.*

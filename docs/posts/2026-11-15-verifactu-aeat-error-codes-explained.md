---
title: "Verifactu error codes: the AEAT's 247, mapped to checks you can run before sending"
seo_title: "Verifactu AEAT error codes explained, and caught before you send"
date: 2026-11-15
tags: [verifactu, spain, aeat, e-invoicing, error-codes, open-source, einvoice-preflight]
description: "The AEAT publishes 247 Verifactu error codes. We mapped 113 of the record codes to offline checks, read the AEAT's reply, and found library copies out of date."
---

When Spain's Tax Agency (AEAT) rejects a Verifactu record, it answers with a four-digit code and a sentence in Spanish: `1150`, "Cuando TipoFactura sea F2 y no este informado NumRegistroAcuerdoFacturacion...". A developer building a billing system then has to work out what went wrong and which part of their code to fix.

Earlier today [E-invoice Preflight](../../ventures/einvoice-preflight/) learned to recompute a record's fingerprint and follow the chain. This update does two more things.

## The AEAT's own list, not a copy of a copy

The AEAT publishes its error codes as a plain file, `errores.properties`. This time its test host answered, so the checker now carries that file byte for byte (247 codes, last changed 30 July 2026) and builds its data from it.

We compared it with the copies open-source libraries ship. One widely used PHP library's dictionary still has codes 1278 to 1280, which the AEAT's file no longer lists. It lacks the eleven newer ones: 1285 to 1293, 2009 and 4141. 4141 says your access to Verifactu has been suspended. 1287 refuses any value containing `< > " ' =`, even when the XML escapes it. If your error handling looks codes up in such a copy, the newest rejections come back with no explanation.

## Fourteen new checks, each named after the code it prevents

The rest of the list is read as rules. Rules VF-029 to VF-042 each name the AEAT code they anticipate. Some examples:

- an issue date before 28 October 2024 (1152);
- a simplified invoice (F2) over 3,000 euro without the flag that allows it (1150);
- the equivalence surcharge rate that goes with each VAT rate on the operation's date: 5.2 or 1.75 beside 21%, 0.26 beside 2% in late 2024 (1160 to 1170);
- reverse-charge lines that carry tax (1198);
- each tax regime's allowed operation types (1199 to 1206, 1286, 1293);
- an apostrophe in a customer's name (1287).

The existing NIF check also got stricter. It used to test only the check letter of a value that looked like a NIF, so `AAAA` passed. The AEAT rejects that with 1123.

Of the 203 codes that concern a record, 113 now map to a check here: 101 fully, and 12 in part, such as a NIF's shape when the AEAT also looks it up in its census. The other 90 need something no file holds: the AEAT's census, the records it already has, its clock, the sender's certificate. Or they concern queries rather than records, or the checks are not written yet. Each of them still gets the AEAT's text and a short reason.

## Read the reply back

Drop the AEAT's reply next to the records you sent. That is the `RespuestaRegFactuSistemaFacturacion`, or the SOAP fault with `Codigo[4102]` when the whole batch was refused. Each rejected line is matched to its record by issuer, number and date. You get the code in English and in the AEAT's words, the check that catches it before sending, and whether that check fires on the record you sent. If the AEAT accepted a record this checker flags, that is reported as well, so a rule stricter than the AEAT's shows up.

We had one real AEAT reply to test with, recorded and anonymised by another open-source project: code 1123, "El formato del NIF es incorrecto", on a NIF of `AAAA`. Before this change the checker would have passed that record. Now it explains the reply and reproduces it.

*Fix, 26 November 2026.* The "accepted, yet this checker flags it" note had a bug. Chain checks (a broken link to the previous record, say) were matched to a record by the start of its invoice number. So a batch holding F1 and F10, where only F10's link was broken, also blamed F1, and an F1 the AEAT accepted was reported as one the checker flags. Chain findings are now matched on the record's full number, date and issuer. A test pins the F1/F10 case.

## What it is not

The mapping comes from reading the AEAT's Spanish text against the rules. We have the AEAT's real answer for only one code so far. It does not look anyone up in the census, does not send anything to the AEAT, and does not certify a billing system. Measurements: `ventures/einvoice-preflight/eval/verifactu-aeat-codes-2026-11-15.md`. The code is MIT.

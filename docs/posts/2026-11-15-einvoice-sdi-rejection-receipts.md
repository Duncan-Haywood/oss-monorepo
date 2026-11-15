---
title: "What SdI said, checked against the file it said it about"
seo_title: "SdI ricevuta di scarto: every error code explained and checked"
date: 2026-11-15
tags: [einvoice-preflight, ventures]
description: "Our checker now reads SdI receipts, explains each rejection code in English and checks it against the invoice. Tried on 33 public receipts."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice before it is sent. For Italy that means FatturaPA files sent through the Sistema di Interscambio (SdI), and we have spent several runs making the checker's Italian rules match the Agenzia delle Entrate's specification. One thing was missing: we had never compared them with anything SdI actually said.

SdI answers every file. A rejection comes back as a small signed XML, the *ricevuta di scarto*, named like `IT01234567890_00001_NS_001.xml`. It lists five-digit codes with an Italian description: `00305`, "1.4.1.1.2 IdCodice non valido". If you are not Italian, or not a developer, this tells you little.

## What the checker does with a receipt

Drop the receipt into the checker, with the invoice if you have it. You get:

- **Each code in plain English, with the fix**, taken from the control list in the Agenzia's specification 1.9 (all 64 codes). SdI's own description and suggestion are kept, with tax numbers withheld.
- **Whether a file-only check can catch it.** About half the codes can: format errors (00200) and most content and arithmetic errors (00400 to 00476). The rest depend on things only SdI has: the tax register (00300 to 00326), its archive of earlier invoices (00404), or the signature (00100 to 00107). The checker says which kind each one is.
- **A verdict on your file.** The receipt is paired with the invoice by file name or by its `Hash`, which is the SHA-256 of the exact file SdI received. Each code is then marked as reproduced or not by the checker on that file. If the hashes differ, you are told that you are not looking at the file SdI saw.

It also reads delivery receipts, could-not-deliver receipts and, for public bodies, the buyer's acceptance or refusal (EC01/EC02) and the deadline and attestation notices. Every code has its own row on a new page, [SdI error codes explained](https://marisstella.app/einvoice-preflight/sdi-error-codes.html). That page is generated from the same table the checker uses, so the two cannot drift apart.

## Tried on real receipts

SdI receipts are hard to find in public, because they are answers about someone's real invoice. We found two sources. One is the Agenzia's own example messages. The other is AgID's EeISI project, which in 2019 sent test invoices through SdI's test and production environments and published what came back. That gave 33 receipts and notices across 7 types. The checker read every one, and every code in them is in the specification's list.

The useful cases were the real ones:

- **A real 00305.** SdI rejected an EeISI invoice because the buyer's VAT number, `IT00999999985`, was not valid. That number fails its check digit, and the checker's VAT checksum rule flags it on the rejected file. This is the first time one of our verdicts has been confirmed against a real SdI rejection. The file was UBL, not FatturaPA: SdI also carries EN 16931 invoices to public bodies.
- **A real 00300 the checker cannot reproduce.** SdI refused the transmitter's tax id. That id passes its check digit, so only the register knows it is wrong. We added a check-digit rule for the transmitter's id (IT-034; nothing checked it before), but it would not have caught this case, and the receipt reader says so rather than pretend otherwise.
- **A delivery that does not mean "correct".** SdI delivered a file with a five-digit Danish VAT number and an 18-character "IT" IBAN. The checker flags both. SdI does not check tax ids issued abroad, and bank details are not in its control list. So both are right: SdI took the file, and the buyer still gets bad details. When a delivery receipt is paired with a file the checker flags, it now says so.

## What is still open

We still have no real *FatturaPA* rejection published together with the file it rejected. That pair would confirm one of the Italian IT-nnn rules end to end, rather than the EU-wide checksum rule. If you have a rejected FatturaPA and its `_NS_` receipt, you can check both on the page and nothing is uploaded. The full measurement is in the venture's `eval/sdi-receipts-2026-11-15.md`.

*This is an offline reading of what SdI said, not SdI and not tax advice.*

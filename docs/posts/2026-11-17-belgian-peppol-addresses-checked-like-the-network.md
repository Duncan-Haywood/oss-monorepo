---
title: "A Belgian Peppol address with a typo passed our preflight 1,769 times in 2,669"
seo_title: "Belgian 0208 Peppol address check digits, checked before sending"
date: 2026-11-17
tags: [einvoice-preflight, ventures]
description: "Our electronic-address check counted digits; OpenPeppol checks the mod-97 pair. Measured against Peppol's own rules: 13,645 misses before, 0 after."
---

Since 1 January 2026 Belgian businesses have had to send each other structured e-invoices, and almost all of them go over Peppol. The receiver's Peppol address is usually its enterprise number (KBO/BCE) under scheme `0208`: ten digits, where the last two are a check pair, 97 minus the first eight digits mod 97. Type one digit wrong and the number fails that check.

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) has a rule for this, INV-041: "the electronic address does not match the published shape for its scheme". For `0208` the rule only counted digits. It also removed every non-digit before counting, so `0403.170.701` and `BE0403170701` passed. OpenPeppol's own rule, PEPPOL-COMMON-R043, rejects all of those as fatal, and so does the access point. A file that passed our preflight could still bounce.

## How we measured it

We didn't write a second checksum to test the first. The oracle is OpenPeppol's assertions themselves, the XQuery functions in the Peppol BIS 3.0.22 rules the tool already ships. They run in the same fontoxpath engine the browser page uses. For each of eight schemes, `eval/endpoint-peppol-differential.mjs` draws 300 ids, finding each check digit by trying values until Peppol's test passes. It then makes eight mutants of each id (a digit changed, two swapped, one dropped or added, a dot, a space, a hyphen, a country prefix) and asks both checks about all of them.

| scheme | what it is | ids Peppol rejects that we passed, before | after |
|---|---|---|---|
| 0208 | Belgian enterprise number | 1,769 of 2,369 | 0 |
| 0192 | Norwegian organisation number | 1,770 of 2,370 | 0 |
| 0007 | Swedish organisation number | 1,762 of 2,362 | 0 |
| 0151 | Australian ABN | 2,364 of 2,364 | 0 |
| 0184, 0096, 0198 | Danish CVR, P and SE numbers | 4,780 of 5,364 | 0 |
| 0088 | GLN | 1,200 of 2,250 | 0 |

The table is seed 7, 21,264 ids in all: 13,645 disagreements before and none after, and none at seed 11 either. We kept one difference on purpose. Peppol's GLN test accepts any number of digits as long as the GS1 check digit works out, and we still ask for 13, because a GLN has 13.

## Why a preflight should repeat a rule the network already runs

If a file says it is Peppol BIS, the tool already runs the official Peppol rules on it, so R043 fires anyway. INV-041 matters in the cases where those rules don't run. One is JSON input from an ERP export, before any XML exists. Another is a UBL or CII file built for XRechnung or plain EN 16931 that is later sent through Peppol. In those cases the built-in check is the only thing between a mistyped number and a bounce. The message now gives the expected shape ("10 digits, no dots or BE prefix") and still never repeats the number.

## A second bug the comparison turned up

To check that the list of known address schemes was right, we compared it with the list in EN 16931's own code-list rule, BR-CL-25. Twelve codes the standard accepts were reported as unpublished (INV-039). One of them is `0225`, the address scheme of France's directory for its 2026 e-invoicing reform. A French invoice addressed the way the new platforms expect drew a false error. All twelve are known now.

## What this does not tell you

A number that passes its checksum is not necessarily a registered Peppol participant. Only an SMP lookup can tell you that, and the tool does not do one. Peppol's warning-level identifier rules (Italian codice fiscale and partita IVA, Dutch KVK and OIN) are not yet part of INV-041. We have not had an access point's verdict on any real address. The full numbers are in the venture's `eval/endpoint-peppol-differential-2026-11-17.md`.

*Estimates and format checks only, not legal or tax advice.*

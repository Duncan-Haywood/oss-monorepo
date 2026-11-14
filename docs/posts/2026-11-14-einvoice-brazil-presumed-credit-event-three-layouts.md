---
title: "Brazil's presumed-credit event has had three schemas in a year"
seo_title: "NF-e event 211110 (presumed credit): three schema layouts compared"
date: 2026-11-14
tags: [einvoice-preflight, ventures]
description: "The NF-e event a buyer sends to claim a presumed IBS/CBS credit changed shape twice in a year. Our checker now reads it and converts the old layout."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html) has been reading the presumed credit inside a Brazilian NF-e since this morning: the two-digit `cCredPres` code and the IBS and CBS groups it must carry. Six of the thirteen codes are never claimed inside the NF-e, though. The table marks them "appropriated by event". The buyer claims those later with a separate XML message, event `211110`, "Solicitação de Apropriação de crédito presumido" (NT 2025.002-RTC, section 8.4). The checker now reads that event too.

## Three schemas, three answers to "who may send it"

The tax authorities have published the event's schema, `e211110_v1.00.xsd`, in three RTC event packages. The file name stayed the same each time:

| Package | Published | Who may send it (`tpAutor`) | Item group |
|---|---|---|---|
| v1.20 | 2025-08-18 | 1, the issuer, only | `gCredPres`: `vBC`, then `gIBS` and `gCBS`, each with its own `cCredPres` |
| v1.30 | 2025-10-07 | 2, the buyer, only | same |
| v1.40 | 2026-07-27 | 1 or 2 | `gCredPresOper`: `vBCCredPres`, one `cCredPres`, then `gIBSCredPres` and `gCBSCredPres` |

v1.40 matches the NT's own field table and is the layout to send today. It also uses the NF-e item's group names (`gCredPresOper`, `gIBSCredPres`), so an event can now repeat what the NF-e would have said.

The older files are still in circulation. `nfephp-org/sped-nfe` is the PHP library much of the Brazilian market builds on, and on master it ships the v1.20 file in three of its schema folders. A system that validates against that copy before sending accepts only `tpAutor` 1, the one value v1.30 then banned, and it rejects every v1.40 event. Unimake's Uninfe example event is in the old layout with `tpAutor` 2, which only v1.30 allowed.

## What the checker does with it

Drop an `envEvento`, `evento` or `procEventoNFe` on the Brazil page or the main checker. You can add the NF-e it refers to in the same picker if you have it. It checks:

- the v1.40 schema of `detEvento` (SEFAZ cStat 493). Against xmllint on the official file, **199 of 199** single changes to a valid event get the same verdict. The first run found three disagreements: the checker trimmed spaces that this schema's string types keep. That is fixed.
- the event Id, which must be `ID` + `211110` + the key + a two-digit sequence (572). Also the key's check digit (236), the model (55 only; an NFC-e is 1049), and the author's CNPJ, which for `tpAutor` 1 must be the issuer inside the key (574).
- each item's `cCredPres` against the table: the code must exist (1055), and the item must have exactly the IBS and CBS groups that code takes (1050, 1053, 1054, 1058).
- with the NF-e: the buyer is the author (575), the item numbers exist (1096), and the event is not dated before the invoice (577).

It also names an old-layout file and offers to rewrite it to v1.40. The rewrite works when each item uses one code for both taxes. v1.40 has room for only one code per item, so it leaves the items it cannot convert unchanged and lists them. The output validates under xmllint. It has to be signed again before it is sent.

## What the public files show

GitHub code search found three NF-e 211110 files, all test samples from one vendor. All three use a made-up key (model `00` and a check digit that should be 6, not 0). Its two v1.40 samples also put an IBS group on code 05, which takes only the CBS. SEFAZ's rule 2P26-10 rejects that with cStat 1053. The checker caught it, and it would have caught it in a real file too. We found no real registered event to compare against, so that comparison is still open.

The full measurement and sources are in the venture's `eval/nfe-event-211110-2026-11-14.md`. This is an offline check, not SEFAZ's registration and not tax advice.

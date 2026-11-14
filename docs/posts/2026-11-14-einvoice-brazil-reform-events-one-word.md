---
title: "Brazil's reform events: twelve schemas, and one word the manual gets wrong"
seo_title: "NF-e reform events 112110 to 212120: schema checks and a trap"
date: 2026-11-14
tags: [einvoice-preflight, ventures]
description: "Every NF-e reform event with a schema is now checked, plus the cancellation. The NT prints one event description differently from its schema."
---

Brazil's IBS/CBS reform adds more to the NF-e than new tax groups. It also adds a family of
*events*: short signed XML messages that a supplier, a buyer or a successor company sends
about an NF-e that was already authorised. This morning
[E-invoice Preflight](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html)
learned to read one of them, the presumed-credit claim `211110`. Since this afternoon it reads
all eleven others that have a schema in the July 2026 events package, plus the generic
cancellation `110001` that can undo any of them.

## What the events are for

NT 2025.002-RTC, section 8, defines them. Grouped by who sends them:

| Sender | Event | What it says |
|---|---|---|
| Supplier (tpAutor 1) | 112110 | the operation was paid in full, so the buyer's presumed credit is released |
| | 112130 | goods perished, were lost or stolen in transport the supplier hired |
| | 112140 | an advance payment was made, but the goods never came |
| | 112150 | a new expected delivery date |
| Buyer (tpAutor 2) | 211124 | the same loss, in transport the buyer hired |
| | 211128 | the buyer accepts the debit from a credit note |
| | 211130 | the item went into fixed assets |
| | 211140 | the buyer claims credit on fuel it consumed |
| | 211150 | the buyer claims credit that depends on its own activity |
| Successor (tpAutor 8) | 212110, 212120 | the answer on an IBS or CBS credit transfer after a succession |
| Original author | 110001 | cancel one of the above |

Each event schema allows exactly one sender type. Only `211110` accepts two.

## One word

Sections 8.9 and 8.10 print the description of the succession events as "Manifestação sobre
Pedido de Transferência de Crédito de IBS em **Operações** de Sucessão". The schemas
`e212110_v1.00.xsd` and `e212120_v1.00.xsd` allow exactly one string, and it says
"**Operação**". SEFAZ validates against the schema, so an event whose developer copied the
description from the PDF is rejected with cStat 493. The checker now spots that case and says
where the text came from. The Fisco's own events `412120` and `412130` use "Operação" in their
schemas as well.

Other small things the schemas say and the field tables don't make obvious:

- `detEvento`'s `versao` attribute is optional in all twelve schemas. Only its value is fixed.
- The supplier's loss event (`112130`) carries a second `vIBS`/`vCBS` pair inside
  `gControleEstoque`: the credit to reverse. The buyer's version (`211124`) has none.
- The cancellation's own list of cancellable types includes `112120` and `211120`, but the
  package has no schema for either.

## What is checked

The schema part (cStat 493) is checked for each type: the fixed description, the state code,
the one allowed sender type, the order of elements, the number formats and unique item numbers.
Against xmllint on the twelve official files, **3,516 of 3,516** single changes to valid
made-up events get the same verdict. 2,672 of those changes make the event invalid.

The envelope checks are shared with `211110`: the Id, the version, and the key's check digit,
state, year, month, model and number (236, 614 to 619). Then the author's CNPJ, which for a
supplier event must be the issuer inside the key (574), and a repeated event in one batch (573).

With the NF-e in the same drop, more is checked. The buyer must be the NF-e's recipient (575),
and the event can't be dated before the NF-e (577). Every item number must exist (1096). For
fixed assets, fuel and activity credit, an item's IBS and CBS can't exceed the NF-e item's
(1097, 1098), and in the same unit the quantity can't exceed `qCom` (1100, 1101). A fuel item
is taxed once, at one point in the chain ("monophase"), so its IBS and CBS sit in a different
group, `gIBSCBSMono`. For those items the checker reads that group's totals.

Drop a cancellation together with the registered event it cancels and four more things are
compared. SEFAZ finds that event by key, type and *sequence number*, so the cancellation's
`nSeqEvento` must be the original's (459). The author must match (1113), and so must the
author's state code (1178). The protocol must be the one in the original's `retEvento` (460).

## The public samples

GitHub code search finds 48 XML files with these events' element names. Ten are a vendor's own
integration layout, not SEFAZ XML. Of the other 38 (29 distinct), **none breaks its event
schema**. All 23 distinct samples from Unimake, a .NET library, share one made-up access key.
Its check digit is wrong, its model is 00, its NF-e number is zero, and its date digits read
as year 11, month 25. Two of their samples carry another event's Id (the `112110` sample's Id
begins `ID110001`). One fixture in freecorpsNFE has an author who is not the issuer. Its file
name, `event-112110-other-author.xml`, says it is meant to fail, and it does.

## Not yet

No real event, registered or rejected, of any of these types has been found to compare
against. The comparisons with the NF-e have only run on our own made-up pair. Measurement
details: `ventures/einvoice-preflight/eval/nfe-rtc-events-2026-11-14.md`. This is an offline
check, not SEFAZ's answer, and not tax advice.

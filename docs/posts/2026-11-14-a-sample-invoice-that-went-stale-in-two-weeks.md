---
title: "A sample invoice that went stale in two weeks"
date: 2026-11-14
tags: [einvoice-preflight, e-invoicing, brazil, nf-e, tax-reform, ibs, cbs]
seo_title: "Brazil NF-e cCredPres: checking a presumed credit before SEFAZ does"
description: "An offline check of NF-e presumed credits (cCredPres) against the NT 2025.002 rules found 6 rejections in 15 public files, one a vendor sample gone stale."
---

Under Brazil's consumption-tax reform (IBS and CBS, Lei Complementar 214/2025), some purchases
let the buyer book a **presumed credit**. Examples are produce bought from a rural producer who
is not a taxpayer, a used car bought from a private person for resale, and goods bought by a
business in the Manaus free zone. On an NF-e, the credit sits in the item's `gCredPresOper`
group. That group holds a two-digit `cCredPres` code from a 13-row table and an IBS part, a CBS
part, or both.

The XML schema checks only that the code is two digits. The rules that matter are in the
technical note NT 2025.002 (rules UB120 to UB130) and in the table's flags. `einvoice-preflight`
now reads both, offline, and every finding names the SEFAZ rejection code it would earn:

- **cStat 1049**: an NFC-e (the retail receipt, model 65) may not carry a presumed credit.
- **cStat 1055**: the code is not in the table.
- **cStat 1053, 1054, 1050, 1058**: the item has the wrong tax parts for its code. Codes 05,
  06, 10 and 13 are CBS only. Codes 07, 08, 09, 11 and 12 are IBS only. The others take both.
- **cStat 1107, 1124**: for code 04, used goods bought for resale, the credit may not be more
  than the item's value.
- **cStat 1056, 1060**: the "suspensive condition" value is allowed only with code 04, and
  only from 2027 for the CBS and from 2033 for the IBS.
- **cStat 1175**: the item's tax classification (`cClassTrib`) does not allow a presumed credit
  at all. Used goods are the rule's own exception.

Some of what the table says is not backed by any rule we could find, so those findings are
warnings, not errors. One is a code the table says is claimed through a separate event, not
on the invoice. Another is an invoice dated before the credit starts. The table starts every
credit on 1 January 2027, and some IBS credits on 1 January 2029.

## The table changed under a vendor's sample

The tables behind these rules change between versions of the technical note.
Version 1.70, published on 1 October 2026 and in production from 16 October, made two
changes that matter here. Classification 410014 (supply by a rural producer who is not a
taxpayer) no longer takes a presumed credit. Codes 01 and 03 became claimable by event only.

We then ran the checker on every NF-e that GitHub code search returned for `gCredPresOper`:
127 files, 15 distinct invoices with a presumed credit. Eight use schema placeholders such as
`string`, and one is a batch wrapper the checker does not open. **All six of the others
raise an error.** One is a sample from a widely used Brazilian invoicing library, named for
exactly this case: a rural producer with a presumed credit on classification 410014. It is
dated 29 October 2026, two weeks after 1.70 went live. Under the new table SEFAZ would refuse
it with cStat 1175. Under the June table we had been using, our checker passed that item. The
others are test files: code `00` (1055), an NFC-e with a credit (1049), and three manual
examples that give code 01 with only one of the two tax parts it needs (1054 or 1058).

None of these is a production invoice, and we have not compared the checker with a real SEFAZ
rejection yet. Still, an example someone copied in October can be wrong by November without
anyone touching it.

## Keeping the classification table current

The same source that dated those changes also let us bring the classification table up to
date. We compared our copy, published in June with 164 codes, field by field with a 173-code
copy at version 1.71. Every difference except start dates was one the change log records. We
applied exactly those changes, and nothing else, on top of the pinned June copy: the 410014
credit, four codes newly allowed on the NF-e, one removed from the NFS-e, one removed from the
NF-e, and nine new codes.

## Where the data came from

The official tables live on a state portal that refused our build machine's connection. So
the cCredPres table comes from an open-source (MIT) transcription that also logs each change
by version. We checked it against two older, independent copies. They agree on every code,
tax part and start date. They differ only on the two flags that version 1.70 changed, and
both copies are older than 1.70. The rule texts come from a transcription of the technical
note. The open-source package lists the same rule numbers, codes and messages.

The checker runs in the browser and uploads nothing:
[Brazil NF-e checker](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html).
The method, sources and per-file results are in the venture's `eval/ccredpres-2026-11-14.md`.
It is an offline observation, not SEFAZ's authorisation, and not tax advice.

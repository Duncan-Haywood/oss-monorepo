---
title: "A UAE credit note that must not name its invoice"
seo_title: "PINT AE volume discount credit note (VD): no BillingReference, ibr-055-ae"
date: 2026-11-14
tags: [einvoice-preflight, ventures]
description: "Under PINT AE, a credit note for a volume discount (reason code VD) must not reference a preceding invoice. Our checker demanded one. It now reads the reason code."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice before it is sent. One of its oldest built-in rules, INV-033, says a credit note should name the invoice it corrects. In the EU that is sound advice: EN 16931 has BT-25 (the preceding invoice reference), and a receiver matching a credit to an open invoice needs it.

The UAE's Peppol profile, PINT AE, makes one exception, and it reverses the rule.

## The rule

PINT AE 2026.5 ships this assertion:

> [ibr-055-ae] Preceding invoice reference (IBG-03) is must when invoice type code (IBT-003) is 381 (Credit note) or 81 (Credit note related to goods or services) except when the [BTAE-03] Credit note reason code is 'VD'.

Read the XPath behind it and it is stricter than the sentence: a 381 credit note passes only if it has a `BillingReference` and no `VD` reason, **or** has no `BillingReference` and a `VD` reason. A volume-discount credit note that names an invoice fails. That makes sense for the business case: a rebate earned over a quarter's purchases belongs to no single invoice, and picking one would misstate what it corrects.

The reason code lives in the document's own `DiscrepancyResponse`:

```xml
<cac:DiscrepancyResponse>
  <cbc:ResponseCode>VD</cbc:ResponseCode>
  <cbc:Description>Volume discount</cbc:Description>
</cac:DiscrepancyResponse>
```

## What the checker did

OpenPeppol's PINT AE examples include `Volume-discount-credit-note.xml`, written exactly this way. The official rules pass it. Our built-in INV-033 blocked it with "Credit or debit note is missing the original invoice it reverses", and told the seller to add the very reference the UAE forbids. It was the last of OpenPeppol's 32 PINT AE example files that our preflight blocked; we had noted it on 2026-11-12 and left it open.

## The fix

- Both readers (the page's `ubl.mjs` and the Python CLI's `ubl.py`) now keep the header-level `DiscrepancyResponse/ResponseCode` values as `credit_reason_codes`. A line's own `DiscrepancyResponse` is about that line and is not read.
- Under a PINT AE CustomizationID (`urn:peppol:pint:billing-1@ae-1` or `selfbilling-1@ae-1`), a `VD` among those codes steps INV-033 aside, on every route (`aside.mjs`, mirrored in `aside.py`).
- Nothing else changes. Without `VD`, outside PINT AE (VD means nothing to EN 16931), with `VD` only on a line, or with a lower-case `vd` (the rule compares the string exactly), INV-033 still fires.

The opposite fault, a VD credit note that *does* name an invoice, is ibr-055-ae's job: tick "Also run the official rules" on the page, or pass `?schematron=1` to the API, and the UAE's own assertion reports it.

## Measured

We ran the whole preflight, built-in checks plus the official rule sets, over every example file phive-rules ships for twelve national profiles (`eval/phive-corpus.mjs`, phive-rules commit 37a2664), before and after the change:

| set | files | clean before | clean after |
|---|---|---|---|
| PINT AE 2026.5 | 32 | 31 | **32** |
| the other 11 sets (PINT A-NZ, SG, JP, JP-NTR, MY, OM, NLCIUS, NLCIUS-CII, CIUS-RO, CIUS-PT, ZATCA) | 268 | same findings, file for file | same |

The NLCIUS file that is deliberately broken with a 381 code on an invoice still gets INV-033, as it should. Five new tests pin the cases above; three of them fail on the old code.

## What it does not do

No UAE business's real credit note was tried, and no accredited service provider's verdict. As reported from the UAE's Ministerial Decisions, businesses with revenue of AED 50 million or more go live on 1 January 2027 ([our UAE page](https://marisstella.app/einvoice-preflight/uae-e-invoice-mandate.html) has the dates and sources); if you have a VD credit note that a real provider accepted or rejected, the checker would learn from it.

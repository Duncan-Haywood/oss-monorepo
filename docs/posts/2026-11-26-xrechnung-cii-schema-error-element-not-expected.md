---
title: "\"This element is not expected\": the XRechnung CII schema errors, and the three we found in our own examples"
seo_title: "XRechnung CII schema error \"element is not expected\": causes and fixes"
date: 2026-11-26
tags: [for-customers, einvoice-preflight, e-invoicing, xrechnung, zugferd, factur-x, cii, germany, france, accountants]
description: "Why a CII e-invoice with correct amounts is refused by the schema check: element order, missing elements and the udt/qdt namespace slip. Our checker now reports them."
---

An XRechnung or ZUGFeRD invoice can have every amount right and still be
refused before anyone reads it. Validators check the XML **schema** first:
KoSIT's validator for XRechnung, the Factur-X checker, Chorus Pro and Peppol
access points. A schema failure usually looks like this:

> Element '{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}PaymentReference': This element is not expected.

Java-based validators say the same thing as `cvc-complex-type.2.4.a: Invalid
content was found starting with element ...`.

## The three causes behind most of these messages

**1. Elements in the wrong order.** The CII schema fixes the order of every
element inside each block. Two orders catch people out:

- In `ApplicableHeaderTradeSettlement`, `PaymentReference` (BT-83) comes
  **before** `InvoiceCurrencyCode` (BT-5).
- In `SpecifiedTradeSettlementHeaderMonetarySummation`, `ChargeTotalAmount`
  comes **before** `AllowanceTotalAmount`. That is the reverse of the order
  most people would guess.

**2. The udt / qdt namespace slip.** A credit note or corrected invoice names
the invoice it refers to (BT-25) and that invoice's date (BT-26). The date sits in
`FormattedIssueDateTime`, and there the schema wants the *qualified* data
type:

```xml
<ram:FormattedIssueDateTime>
  <qdt:DateTimeString format="102">20260902</qdt:DateTimeString>
</ram:FormattedIssueDateTime>
```

Everywhere else in the invoice (the issue date, the due date, the delivery
date) the same element is written `udt:DateTimeString`. Copying that line
gives `udt:` where `qdt:` belongs. To a validator that is a different element,
so the file fails. The root element must also declare `xmlns:qdt`.

**3. A value of the wrong form.** The schema itself refuses `1234,56` in an
amount, because the decimal separator must be a point and there is no
thousands separator. It also refuses an `Indicator` that is not `true` or `false`.

## We found all three in our own examples

This week our checker started running the CII schema (the EN 16931 subset of
UN/CEFACT D16B that CEN publishes). Its first run found three of our own
example files invalid:

- our sample EN 16931 invoice had `PaymentReference` after the currency and
  `AllowanceTotalAmount` before `ChargeTotalAmount`;
- both our XRechnung and Factur-X credit notes wrote BT-26's date as
  `udt:DateTimeString`.

Our earlier checks had passed all of them. The EN 16931 business rules
(Schematron) do not look at element order or namespaces, which is why a file
can pass the business rules and still fail the schema. We fixed the examples.

## What the checker reports now

For any CII file declared as EN 16931 or one of its national variants
(XRechnung, Factur-X / ZUGFeRD EN 16931 and BASIC, NLCIUS, the French CIUS),
it reports:

| Rule | What it means |
|---|---|
| CII-001 | an element the schema does not allow here, or one too many |
| CII-002 | elements out of order (it names the element and what it cannot follow) |
| CII-003 | a required element is missing |
| CII-004 | a value of the wrong form (number, date, true/false, length) |
| CII-005 | an attribute the schema fixes, such as `listID="ISO 4217 3A"`, with another value |
| CII-006 | the XML is not well formed (often a cut-off file) |
| CII-007 | an element in the wrong namespace (the udt/qdt slip above) |

Each finding comes with a plain-language explanation in German, French or
English. To test the check, we changed the official CEN example invoices and
our own examples at random 499 times: swapped and removed elements, wrong
namespaces, decimal commas. On every one of the 499 files, our verdict was the
same as xmllint's using the same XSD.

**What it does not check yet:** the UBL 2.1 schema, and Factur-X EXTENDED,
MINIMUM and BASIC WL files, which each have their own schema. A file in one of
those can still pass here and be refused by a schema validator. Code lists
(currencies, units) are checked by the EN 16931 rules, not by the schema.

A pass here is a strong sign that a validator will accept the file, but not an
acceptance by any portal. The checker explains errors; it does not give tax
advice.

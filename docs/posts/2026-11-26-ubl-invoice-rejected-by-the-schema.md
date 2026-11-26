---
title: "Your UBL invoice passed the rules and was still rejected: the schema comes first"
seo_title: "UBL 2.1 invoice schema validation errors, explained"
date: 2026-11-26
tags: [einvoice-preflight, for-customers]
description: "Peppol and XRechnung validators run the UBL 2.1 XSD before any rule. The seven ways a file fails it, checked to match xmllint on 21,719 of 21,726 files."
---

A UBL invoice goes through two gates when you send it to a Peppol access point or to Germany's XRechnung validator. The second gate is the business rules everyone talks about: EN 16931's BR-… rules, and the national ones on top. The first gate gets less attention. Before any rule runs, the file is checked against the **UBL 2.1 XML schema** (the XSD) published by OASIS. A file that fails the schema is refused, and no business rule ever looks at it.

Until today, [E-invoice Preflight](https://marisstella.app/einvoice-preflight/) did not check that first gate for UBL. A file could pass here and be refused there. It now checks the schema on every UBL invoice and credit note before anything else.

## The seven ways a UBL file fails the schema

| Rule | What is wrong | A typical cause |
|---|---|---|
| UBL-XSD-01 | an element the schema does not allow at that spot, or one too many | a custom field added to the export template; two `IssueDate`s |
| UBL-XSD-02 | elements in the wrong order | the template writes `PostalZone` after `CountrySubentity`; UBL wants it before |
| UBL-XSD-03 | a required element is missing | no `IssueDate`, or an `ExtensionContent` left empty |
| UBL-XSD-04 | a value the schema cannot read | `1.234,50` for an amount, `24.08.2026` for a date, `25:00:00` for a time |
| UBL-XSD-05 | an attribute problem | an amount with no `currencyID`, a measure with no `unitCode`, an attachment with no `mimeCode`, or an attribute UBL does not define |
| UBL-XSD-06 | the wrong namespace | `cac:IssueDate` where UBL says `cbc:IssueDate`; a root that is not in the `Invoice-2` namespace |
| UBL-XSD-07 | the XML is not well formed | a file cut off in transfer, or a tag closed out of order after hand editing |

Order is the one that surprises people. In UBL the order of elements inside each block is fixed. A postal address written as street, city, region, postcode is wrong even though every field is present and correct, because the schema wants the postcode before the region. Most invoicing software gets this right. Hand-built templates and in-house exports often do not.

Each finding names the element and says what to change, in English, German or French. It never repeats the value, so a report can be passed on without exposing the invoice's contents.

## How we know it agrees with a real validator

A schema checker that disagrees with the validators is worse than none, so we measured it against xmllint (libxml2) running the official OASIS schema files:

- **All 38 UBL files** we hold (our examples, the French FNFE test files and the OASIS package's own examples) get the same pass or fail from both. The two xmllint refuses, we refuse for the same reason.
- **21,719 of 21,726 altered copies** of those files agree. Each copy had one change: an element deleted, duplicated, moved, renamed into the wrong namespace, an attribute dropped or invented, or a value broken.
- **The 7 that differ** are one case. Base64 attachment data with a stray character, such as a euro sign, is accepted by libxml2, which silently skips characters it does not expect. The schema standard does not allow this, and the Java XML parser used by the KoSIT and phive validators refuses it too. So do we.

The full method, and the code to rerun it, is in the project's evaluation notes.

## What it does not check

- What sits inside a UBL extension. The schema lets an extension hold any content from another namespace. We check that there is exactly one such element and do not look inside it.
- The separate schemas of Factur-X / ZUGFeRD EXTENDED, MINIMUM and BASIC WL files. CII files in the EN 16931 profile and its national variants such as XRechnung CII are checked against their own schema by a sibling pass that landed the same day.
- Whether the invoice is right. Passing the schema only means the receiving system can read the file; the business rules come after it.

These are offline checks, not legal or tax advice and not an acceptance by any authority or network. [Check a file in your browser](https://marisstella.app/einvoice-preflight/); nothing is uploaded.

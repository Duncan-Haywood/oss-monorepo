---
title: "The missing schema: checking NAV Online Számla files against the XSD NAV doesn't ship"
seo_title: "NAV Online Számla SCHEMA_VIOLATION: check XML against the 3.0 XSD"
date: 2026-11-15
tags: [einvoice-preflight, ventures]
description: "Our Hungarian NAV checker now runs NAV's schema first, namespaces included. On 5,776 broken copies of NAV's samples it agrees with xmllint on all."
---

Every Hungarian invoice is reported to NAV, the tax authority, as an XML file in NAV's own format, Online Számla 3.0. If the file does not fit NAV's schema, NAV refuses it before checking anything else. The answer is `SCHEMA_VIOLATION`, the invoice counts as not reported, and you only find out after sending.

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) already checked these files against NAV's business rules: VAT rates, customer data, modification structure and the arithmetic behind NAV's warnings. It did not check the schema. The reason was mundane: NAV's main schema imports a second file, the "NTCA common 1.0" schema, and that file is not in NAV's public repository.

## Finding the file

Three unrelated open-source projects keep a copy of it. After normalising line endings, all three copies are identical, byte for byte. The build script fetches one copy and refuses to run if its SHA-256 differs from the hash the three agreed on. The repository keeps only facts read from the schema (which elements go where, how often, and what values each allows), not the schema itself.

## What it checks now

Six new rules run before the business rules: an element NAV does not allow at that point, elements out of order, a required element missing, a value outside its length, pattern, range or code list, an attribute fault, and one that plain XML validators flag but people miss: **the namespace**.

NAV's format mixes three namespaces. Tax numbers and addresses are written `<base:taxpayerId>`, while most other elements have no prefix. If you edit a file by hand or build it with string templates, dropping or adding a `base:` prefix is easy, and the result still looks right. To NAV it is a different element, and the file is refused. The checker now says which element is in the wrong namespace and which prefix it needs.

## Checked against xmllint

We did not want a second opinion that only agrees with itself. So we took NAV's 30 sample invoices, which pass both our checker and xmllint (the libxml2 validator), and broke them in 13 ways: deleted, duplicated, swapped or unknown elements, emptied or overlong values, letters where numbers go, a euro sign, a short date, a flipped boolean, and a dropped or added namespace prefix. Over two random seeds that made 5,776 broken files. On every one, our verdict was the same as xmllint's: 4,827 refused by both, 949 accepted by both.

The first runs did disagree, and both times the mistake was ours:

- **Namespaces.** The first version compared element names only, so 300 prefix mistakes got through. That is why the namespace rule exists.
- **Fixed values.** Two NAV flags, `vatDomesticReverseCharge` and `noVatCharge`, are declared as always `true`. Under XSD rules an empty one counts as `true`, so it is valid, and `false` is not. We had ignored the declaration. The shared validator now handles it, and that also corrects our Polish KSeF check.

The broken files also crashed one of the existing business checks, on a summary row with an empty VAT rate. That is fixed too.

## A real fault in NAV's own example

NAV publishes an example of the API request that carries these reports. All three invoices in it still use `privatePersonIndicator`, an element from version 2.0 that 3.0 replaced with `customerVatStatus`. xmllint refuses it too. The checker now flags it, and the suggested fix names the replacement.

## What it is not

xmllint is a standard reference for XML Schema 1.0, but it is not NAV's own validator. We have not yet seen a real business's report together with NAV's actual `SCHEMA_VIOLATION` message, to compare the wording and the location NAV gives. If you have one you can share with the tax numbers removed, the [custom development page](https://marisstella.app/custom-development/) takes it with no account. The check runs in your browser and nothing is sent to NAV. It is an offline observation, not NAV's acceptance and not tax advice.

Details and counts: `ventures/einvoice-preflight/eval/hungary-nav-xsd-2026-11-15.md`.

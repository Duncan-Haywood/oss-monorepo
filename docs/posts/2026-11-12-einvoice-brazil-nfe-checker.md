---
title: "Checking a Brazilian NF-e before SEFAZ does: a schema in 63 KB and the sums behind cStat 610"
seo_title: "Free NF-e 4.00 XML validator: schema, access key and totals"
date: 2026-11-12
tags: [einvoice-preflight, ventures, brazil, nf-e]
description: "E-invoice Preflight now reads Brazil's NF-e and NFC-e 4.00 XML in the browser. Its schema check agrees with xmllint on 2,600 of 2,600 mutated files."
---

Every goods invoice in Brazil is an NF-e: XML that the state tax authority (SEFAZ) has to authorise before the goods move. When it refuses, the answer is a three-digit code. 610 means "Total da NF difere do somatório dos valores que compõem o valor total", the invoice total does not equal its parts. 564 means the products' total does not match the items. 236 means the access key's check digit is wrong. Most of these can be caught on your own machine before the file is sent. Until today [E-invoice Preflight](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html) could only check a CNPJ's digits for Brazil. Now it reads the whole file.

**What it checks.** Drop an NF-e (model 55) or NFC-e (model 65) on the [Brazil page](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html) or the main checker. Nothing is uploaded. It checks:

- the NF-e 4.00 schema (element order, required fields, codes, patterns, lengths);
- the 44-digit access key, its check digit, and each of its nine parts against the fields it is built from;
- CNPJ and CPF check digits;
- each item's quantity times unit price;
- every `ICMSTot` total against the items, and `vNF` against the parts it is built from;
- an NFC-e's payments less change;
- the state and city codes, and each CFOP's first digit against the direction of the operation.

Where a finding matches a SEFAZ rejection, it names the cStat.

**A schema compiler, not a schema validator.** The official layout, `leiauteNFe_v4.00.xsd`, is 7,339 lines with nested choices: an item's ICMS is one of 21 groups, and the customer is a CNPJ, a CPF or a foreign ID. A browser has no XSD engine. So a build script reads the XSD once and compiles each of its 114 complex types into a regular expression over child-element names. A sequence becomes a run of names, a choice becomes alternatives, and `minOccurs`/`maxOccurs` become quantifiers. The 335 simple types become plain facts. The result is a 63 KB module. To see whether it judges files the way a real validator does, we took four files that xmllint accepts and made 2,600 single changes to them: deleting, duplicating or swapping elements, and emptying, padding or corrupting values. Then we compared verdicts. **All 2,600 agree.** The first run disagreed on two. One was a deleted `infNFe`. The other was a duplicated item, which xmllint rejects because of an `xs:unique` key on `nItem` that the compiler had ignored. Both are now handled.

**The access-key digit.** The key's mod-11 rule reproduces 16 of the 22 distinct keys in sped-nfe's test files. The other six look like test keys with an edited digit: one carries an emitter CNPJ whose own check digits fail. Chance would match about 2 of 22.

**What it does not do.** It does not check the signature. It does not check whether a CNPJ or state registration exists, tax rates, NCM or CEST lists, or the state-specific rules in SEFAZ's manual. The IBS and CBS tax-reform groups postdate the schema it reads, so they are named and skipped rather than guessed. The same goes for the alphanumeric CNPJ's key digit. The next useful input is a real SEFAZ rejection to compare against. If you have one you can share with the numbers blanked, the [custom-development page](https://marisstella.app/custom-development/) takes it without an account.

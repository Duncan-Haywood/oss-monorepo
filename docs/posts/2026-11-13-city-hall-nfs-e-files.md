---
title: "What 15 real city-hall NFS-e files told us about Brazil's municipal invoice schema"
seo_title: "Free ABRASF NFS-e XML validator: schema, IBGE codes and ISS sums"
date: 2026-11-13
tags: [einvoice-preflight, brazil, nfs-e, real-data]
description: "A check for Brazil's municipal NFS-e (ABRASF) agrees with xmllint on 3,447 of 3,447 test files; real city-hall replies held schema gaps of their own."
---

In Brazil, goods go on an NF-e and services go on an NFS-e. The national NFS-e
system is new. For years each city hall ran its own service-invoice web service,
and most of them follow one model: ABRASF's, namespace
`http://www.abrasf.org.br/nfse.xsd`. [E-invoice Preflight](https://marisstella.app/einvoice-preflight/)
already checked the national layout. As of today it also reads ABRASF files, on
the main checker and on the
[Brazil page](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html).
Everything runs in the browser and nothing is uploaded.

## What it checks

- **The schema**, for layouts 2.03 and 2.04: element order, required fields, the
  LC 116/2003 service item codes, lengths and formats. It also catches a
  missing or mistyped namespace. One public file had `http:/www.abrasf.org.br`,
  with a single slash, and a city's web service will not read that file at all.
- **Identifiers:** CNPJ and CPF check digits. Every IBGE city code is checked
  against IBGE's list of 5,571 codes, against its own check digit, and against
  the state written beside it. Nine real city codes, such as Quixaba (2611533),
  do not follow the check-digit rule. We found them by running the rule over
  the whole list, so they don't get flagged.
- **The values:** the ISS base is the service value minus deductions minus the
  unconditional discount. The ISS is that base times the rate. The net amount
  takes off the federal withholdings, the ISS when it is withheld
  (`IssRetido` 1), and both discounts. Deductions plus the unconditional
  discount can't be more than the service value.

## How we measured it

GitHub code search turned up 394 ABRASF files: vendor examples, library test
fixtures, templates, and some real NFS-e that city halls sent back. That came to
316 distinct files.

- **Against xmllint:** we ran our checker and xmllint on the same two schemas.
  For 132 of 134 files they gave the same valid-or-invalid answer. The other two
  differ only inside the digital signature, which we don't read. Then we made
  single changes to the 34 valid files. All 3,447 of the changed files got the
  same answer from both.
- **A whitespace quirk:** the first run disagreed 29 times. xmllint (and PHP,
  which many Brazilian ERPs use to validate) rejects a stray space around a
  date or a city code. The XSD standard says that space should be trimmed. We
  report it anyway: a space there is never intended, and it gets rejected
  wherever libxml2 does the validating.

## What the real city files showed

Fifteen files came from six city halls: Aparecida de Goiânia, Belém, Campo Novo
do Parecis, Comodoro, João Dourado and Ribeirão Preto. Together they hold 95
issued NFS-e. The base, ISS and net-amount checks raised nothing on any of them.
That matters, because those formulas came from integration manuals that quote
the ABRASF manual. The manual itself wouldn't load from our build machine.

The schema was a different story. Seven replies from Aparecida de Goiânia leave
out the required `Numero` in an address. Ribeirão Preto's reply leaves
`NomeFantasia` empty. Campo Novo do Parecis adds its provider's own status
elements. xmllint flags all of these too. They are real gaps between what some
cities send and the published model, so a strict reader of a city's own reply
can fail.

## What it does not do

We haven't tested a real file with the ISS withheld; none of the 95 had it. The
tool doesn't read city-specific variants (ISSNet, GINFES and Betha all extend
the model). Layouts 2.01 and 2.02 get the identifier and value checks but not
their own schemas. It doesn't check city tax rates or the signature. A clean
result means these offline checks found nothing. It does not mean the city
accepted the file, and it is not tax advice.

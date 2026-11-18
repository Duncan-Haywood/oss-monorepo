---
title: "Rio's Nota Carioca service codes: 998 codes, five acts, one check"
seo_title: "Nota Carioca CodigoTributacaoMunicipio: Rio's code table checked"
date: 2026-11-16
tags: [einvoice-preflight, ventures, brazil]
description: "Rio de Janeiro's NFS-e takes a six-digit service code from a table changed by four acts since 2018. We read them all and now check the code offline."
---

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) checks Brazilian municipal service invoices (NFS-e) offline. Until this run it checked a Rio de Janeiro file's ISS rate against the city's tax code, but not the field that names the service in Rio's own terms.

## Two codes for one service

A Nota Carioca NFS-e names its service twice. `ItemListaServico` holds the national subitem from Lei Complementar 116 (`0102`, programming). `CodigoTributacaoMunicipio` holds a six-digit code, which must come from Rio's own Tabela de Códigos de Serviços (`010201`). Portaria F/SUBTF/CIS 256/2018 says the issuer "deverá ... utilizar, para identificar o serviço, um dos códigos da Tabela".

That table started with 963 codes in August 2018 and has changed four times since then:

| act | in force | change |
|---|---|---|
| 269/2020 | February 2020 | adds municipal pipeline transport and "other municipal transport" |
| 282/2021 | 20 Dec 2021 | adds opinion and market research and remote vehicle tracking |
| 286/2022 | 14 Jul 2022 | removes the 18 hotel-works codes |
| 321/2025 | 1 Jan 2026 | adds 30 codes, removes 19, and applies the codes to the national NFS-e too |

So a code that was correct in 2025 can be wrong in 2026. That is true of `07.06.16` (painting) and of 13 other floor, wall and window finishes in 07.06. Portaria 321/2025 took all 14 off the table and added new 07.02 codes for work done "quando vinculada a obra de construção civil".

## One surprise in the numbering

The rate check already in the tool has to convert numbers. Rio's tax code (Lei 691/1984, art. 8) closed the gaps that LC 116's vetoes left, so Rio's own 17.24 is LC 116's 17.25. We expected the code table to use the same renumbering. It does not. It uses LC 116's numbers: it has 03.05, 07.22, 13.05 and 17.25, and none of those exist in art. 8's list. That means the first four digits of a code must equal `ItemListaServico` exactly as written. The new check depends on that.

## What the check does

The new rule, `ABR-026`, runs on files issued by Rio's system. It does not run on files that merely name Rio as the place where the ISS is due, because the code belongs to the issuing city. It flags four things:

- a code that is not six digits;
- a code that is not on the table;
- a code whose first four digits name a different subitem from `ItemListaServico`;
- a code that was not on the table on the file's competence date.

Every message lists the codes the table had for that subitem on that date.

We tested it on 74 public files found by GitHub code search. Of these, 22 distinct files were issued by Rio's system, and none were flagged. Four samples from Niterói write `16.02` as their municipal code. Their buyer is in Rio, but they are not Rio files, so the rule correctly leaves them alone. We also planted 76 faults in the Rio files, such as another subitem's code, a four-digit code, or a code that 321/2025 removed on a 2026 file. All 76 were caught.

## What it cannot tell you

We have no Nota Carioca rejection to compare against, so these findings follow the table as the acts state it, not the web service's own error text. National NFS-e files are not judged either: their `cTribMun` is a three-digit parameter that links to Rio's codes inside the national system, and that link is not published. The method, sources and counts are in the venture's `eval/rio-service-codes-2026-11-16.md`.

*An offline observation, not the municipality's acceptance and not tax advice.*

---
title: "Ginfes, the tipos: prefix, and checking an NFS-e that spans thirteen schema files"
seo_title: "Ginfes NFS-e XML validation: namespaces, tipos: prefix, v03 schemas"
date: 2026-11-13
tags: [einvoice-preflight, brazil, nfs-e, measurement]
description: "Ginfes 1.00 and WebISS 1.00 NFS-e files are now checked against their multi-file schemas: 64 of 64 Ginfes files and 2,471 of 2,471 mutants match xmllint."
---

Earlier today the [e-invoice checker](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html) learned to check a Brazilian municipal NFS-e against the schema copy of the provider each city runs. One gap was big: **Ginfes**. In OpenAC.Net.NFSe's list of 198 cities, Ginfes 1.00 is the provider named most often (34 cities, Guarulhos among them). Yet the checker didn't recognise a Ginfes file at all.

## Why Ginfes is different

ABRASF 2.x files use a single namespace, so every element sits in `http://www.abrasf.org.br/nfse.xsd`. Ginfes's older layout splits the namespaces up:

- each web service message gets a namespace of its own, such as `http://www.ginfes.com.br/servico_enviar_lote_rps_envio_v03.xsd` for a batch;
- the shared types get another, `http://www.ginfes.com.br/tipos_v03.xsd`.

In a batch, `EnviarLoteRpsEnvio` and its `LoteRps` are in the message's namespace, and everything inside `LoteRps` is in the types namespace. That's why Ginfes files are full of `tipos:` prefixes, and why a file that drops one is wrong even though it looks the same to the eye. The schema is 13 files: one types file plus six request/reply pairs.

## What changed

The schema compiler now takes a set of files instead of one. It merges the types by name, and it takes each element's namespace from the file that declares it. Only elements outside the shared namespace carry a namespace tag, so the existing ABRASF tables come out byte for byte the same. The checker spots a Ginfes file by its root's namespace (also when the file arrives escaped inside a SOAP parameter, which is how Ginfes's web service takes it). It then checks every child against the namespace the schema gives it. A missing `tipos:`, or a `tipos:` on `LoteRps`, now gets a finding that names both namespaces.

WebISS 1.00 came along for free: it's another multi-file set (16 files), all in `http://www.abrasf.org.br/nfse`.

## How well it matches

We compared against xmllint on the same schema files, using Ginfes XML found by GitHub code search (integrators' samples, ERP fixtures, templates):

- 64 distinct Ginfes files: **64 of 64** got the same valid-or-invalid verdict (42 valid, 22 not);
- the 42 valid ones, each changed one way at a time (a value deleted, emptied, lengthened or padded; an element dropped, duplicated, swapped or invented): **2,471 of 2,471** got the same verdict.

The invalid ones are mostly templates with placeholders still in them. One pattern stood out: five cancel requests, from two well-known integrators, write `<Pedido xmlns="">`, which takes the request out of the namespace the published schema requires. xmllint refuses them too. We don't know whether Ginfes's server actually validates cancel requests, so the checker reports the schema fact and leaves it there.

The checker also now works in the other direction. If you send an ABRASF 2.x file for a city the list says runs Ginfes, the result says that city's web service reads Ginfes's own namespaces, and that the list itself may be out of date.

## Not done

ISSNet 1.00 (its types use `xs:all`, which the compiler doesn't model yet), Betha 1.00 (unqualified local elements), Ginfes's older v02 files, and the real test: a Ginfes city's own reply or rejection compared with what the checker says. As always, this is an offline check, not the city's acceptance, and not tax advice.

---
title: "Checking a Mexican waybill: what 322 public Carta Porte files showed"
seo_title: "Carta Porte 3.1 checker: XSD, catalogues and 322 public files"
date: 2026-11-12
tags: [einvoice-preflight, ventures]
description: "A free offline check for Mexico's Carta Porte 3.1 waybill, run on 322 public CFDI files: 21 schema-valid, and a bug in our own decimals check."
---

Goods that move on a Mexican road, railway, sea lane or air route travel with a CFDI that carries the *complemento Carta Porte*. It lists where the load leaves from and where it goes, what it is and what it weighs, the truck, train, vessel or aircraft, and who drives it. A carrier stopped without a valid one can have the load held. The [e-invoice preflight](https://marisstella.app/einvoice-preflight/mexico-cfdi-e-invoice-mandate.html) now reads version 3.1 of the complement offline, in the browser. The file never leaves your machine.

## What it checks

The structure comes from SAT's own `CartaPorte31.xsd` and `catCartaPorte.xsd`: element order, required attributes, patterns, and every catalogue code. That includes 48,757 product keys, 8,447 stations and 4,686 UN numbers for hazardous material.

The XSD's documentation also states rules that a schema validator can't enforce:

- `TotalDistRec` is "la suma de las distancias recorridas". If the legs say 160 km and 152.5 km, the total should be 312.5.
- `NumTotalMercancias` counts the `Mercancia` nodes. `PesoNetoTotal` sums the `PesoNeto` values.
- A quantity's `IDOrigen` and `IDDestino` must name locations that exist, of the right type.
- When any good is hazardous and moves by road, the environmental insurer and policy have to be filled in.

SAT's catalogue spreadsheet adds facts the XSD leaves out. Each station has a transport mode, so a rail station on a trucking waybill is wrong. Each permit has a mode too, so a road permit (`TPAF01`) on an aircraft is wrong. A `T3S2` tractor-trailer needs a `Remolques` node and a `C2` straight truck can't have one. A product key such as premium petrol (`15101515`) is flagged hazardous, so `MaterialPeligroso` has to say "Sí" and give a UN number and packaging.

All of this became ten rules, `MX-070` to `MX-079`. They are our own ids. SAT publishes an error matrix with its CP codes, but its download server refused our build host. So we didn't map the rules to those codes, and the README and each rule say what they rest on instead.

## Tested against xmllint, then against real files

We planted 43 kinds of defect in five made-up waybills (road, international road, air, rail and sea), and the checker caught all 125. We also mutated the same files 1,848 ways (deleting attributes, adding junk, reordering elements) and compared our schema verdict with xmllint's on SAT's real XSD. All 1,848 agreed.

Made-up files only show so much, so we then searched GitHub for "CartaPorte31". That gave 699 XML files and 322 distinct CFDI 4.0 files with the complement. They aren't copied into the repository. The search and the script are in `eval/cartaporte-public-files.md`.

- **Our schema verdict matched xmllint's on 314 of 314** readable files. The other 8 weren't CFDIs at all: a deliberately broken root and Odoo report templates.
- **Only 21 of the 322 are schema-valid.** 257 come from one project's generated demo and stress files. These use attributes from older versions (`Placa` where 3.1 says `PlacaVM`), give gross weights that don't add up to the goods' weights, and put tractor-trailers on the road with no trailer listed.
- **Five carry a real PAC's stamp.** Two real waybills from one business draw no finding, and neither does one SDK sample. One draws only RFC check-digit warnings, on RFCs the PAC accepted. So some registered RFCs fail the mod-11 digit, which our RFC check already warns about. The last one, a PAC test-environment file, sends a quantity to location `DE202021`, which doesn't exist in the file, and it was stamped anyway. A stamp doesn't prove the cross-references hold.

## The bug the real files found

One of those stamped files had `PesoBrutoVehicular="27.8900"`, and our checker reported it as having more than the 2 decimals the XSD allows. xmllint accepts it, and so did the PAC. XML Schema's `fractionDigits` limits the value, not how it is written, so `27.8900` has two decimals. The check came from the shared CFDI schema layer, which counted written zeros, so it affected every complement. Trailing zeros are now dropped before counting, and the 1,848-case comparison includes a mutation that adds them.

## What it doesn't do

It doesn't use SAT's CP codes or any rule only the matrix states. That includes date windows, the IdCCP's link to the stamp and vehicle weight limits under NOM-012. It doesn't check a postal code's colonia or municipality, or look up an RFC in SAT's register, and it doesn't read Carta Porte 2.0 or 3.0. A clean result isn't acceptance by a PAC or SAT. The check is free and MIT licensed. Try the waybill sample on the [Mexico page](https://marisstella.app/einvoice-preflight/mexico-cfdi-e-invoice-mandate.html): it plants five faults, and the checker names all five.

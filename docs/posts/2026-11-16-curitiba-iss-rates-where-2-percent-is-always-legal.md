---
title: "Curitiba's ISS rates: the city where 2% is always a legal rate"
seo_title: "Curitiba ISS rates by service (LC 40/2001 art. 4), checked"
date: 2026-11-16
tags: [e-invoicing, brazil, nfs-e, iss, curitiba]
description: "Curitiba's ISS law sets 2%, 2.5%, 4% or 5% by service. We added it to the NFS-e checker and tested it on 19 public files. Two clauses limit what it can catch."
---

The [e-invoice preflight](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html) already checked an NFS-e's ISS rate against São Paulo's and Rio de Janeiro's own laws. Both cities passed a test that only asks for the national 2% to 5% band. Today it learned Curitiba's: Lei Complementar 40/2001, art. 4.

**What the law says.** The 2020 consolidated text from the city, plus the three later laws that touch the tax code (LC 119/2020, LC 134/2022 and LC 146/2025), gives this:

- **2%**: collective transport, leasing, schools, theatre, circus, shows, fairs, sports competitions, event production and franchising, plus any service exported or delivered through a call centre or remote support;
- **2.5%**: security, typesetting, tyre retreading, cleaning, insurance brokerage and commercial representation;
- **4%**: hospitals, health plans and health-service cooperatives, registries and notaries;
- **5%**: everything else.

**Two surprises.** First, Curitiba keeps the federal list's numbers. São Paulo and Rio closed the gaps LC 116 left at its vetoed subitems, so their "17.24" is the federal 17.25 and the checker has to convert. Curitiba's own list still reads "(VETADO)" at 3.01, 7.14, 7.15, 13.01 and 17.07, so no conversion is needed.

Second, two of the 2% clauses name no service at all: exports, and call-centre or remote-support work. Any subitem can therefore lawfully carry 2% in Curitiba, and the checker never flags it. A domestic software house filing 2% instead of 5% gets through. Catching that would need to know whether the buyer is abroad and how the service was delivered, and the file only partly says. The page states this limit rather than guessing.

**Dates matter.** Until LC 146/2025 (9 June 2025), the 4% clause covered "cooperativas de serviços", meaning cooperatives of any kind. Since then it covers only health-service cooperatives. So for 2024 and 2025 competences, 4% is accepted on any service; from 2026 it is accepted only for health, health plans and registries.

**Tested on real files.** GitHub code search turned up 19 public NFS-e and RPS files that name Curitiba's IBGE code (4106902). In 9 of them Curitiba is where the ISS is due, and only 2 reach the check: both are not on Simples Nacional and charge 5% on software development, which passes. The other 7 are Simples Nacional or MEI providers, which the check skips by design. Nothing was flagged. Every file was a library fixture or example, so this is a small false-alarm reading, not a catch rate. The details, sources and the script are in the venture's `eval/iss-city-rates-curitiba-2026-11-16.md`.

**Not done: Belo Horizonte.** Its law (Lei 8.725/2003, art. 13) was next on the list. Every host with a consolidated text, the city's own finance portal included, refused our build machine. That table waits for a session that can read it.

This is an offline observation about a file, not tax advice. Simples Nacional, MEI, special regimes and ISS not due in the city are not judged.

---
title: "São Paulo numbers its ISS service list differently from LC 116. Our NFS-e checker now knows"
seo_title: "São Paulo ISS rate by service (Lei 13.701 art. 16) on an NFS-e"
date: 2026-11-15
tags: [einvoice-preflight, ventures]
description: "São Paulo taxes software at 2.9%, not 5%, and its service list is shifted against LC 116. Our NFS-e check now reads the city's rates and the shift."
---

Earlier today [E-invoice preflight](https://marisstella.app/einvoice-preflight/) learned Brazil's national ISS band: no city may charge less than 2% or more than 5%. A rate inside the band can still be the wrong one for the city. So the checker now reads one city's own rate for each service, starting with the largest: São Paulo.

## What São Paulo charges

Lei 13.701/2003, art. 16, as amended up to 2025 (the city's consolidated text):

- **2%**: health and veterinary services (items 4 and 5), education (8.01), notaries and registries (21.01), streaming content (1.09), and about a dozen other named subitems;
- **2.5%**: fair and exhibition planning;
- **2.9%**: the rest of IT (item 1) and advertising insertion;
- **5%**: everything else.

Several clauses set a rate for only part of a subitem: school transport and taxis inside "other municipal transport", payment facilitators inside one financial-services subitem, platform intermediation inside brokerage. An NFS-e cannot say which part a service is, so the checker accepts either the subitem's general rate or the part rate, and reports anything else.

## The trap: two lists, two numberings

The rate law cites São Paulo's own service list, and that list does not use LC 116's numbers. When LC 116 was signed in 2003 the President vetoed subitems 3.01, 7.14, 7.15, 13.01 and 17.07, and the federal list kept the gaps. São Paulo's list closed them. We matched all 200 of the city's subitem texts against LC 116's, and four runs are shifted:

| São Paulo | LC 116 |
|---|---|
| 3.01 to 3.04 | 3.02 to 3.05 |
| 7.14 to 7.20 | 7.16 to 7.22 |
| 13.01 to 13.04 | 13.02 to 13.05 |
| 17.07 to 17.24 | 17.08 to 17.25 |

NFS-e files carry LC 116's numbers. So when the law says 2.9% for "17.24", it means advertising insertion, which an NFS-e codes as 17.25. A table typed straight from the law would put 17.25 at the default 5% and flag every correct advertising invoice in the city. The checker converts the numbers, and when it reports a shifted subitem it gives both.

## Run on public files

GitHub code search turned up 70 NFS-e files that name São Paulo; 35 have it as the city where the ISS is due. Four of those were issued by São Paulo's own system in production. All four pass, and one of them is advertising insertion at 2.9% under **17.25**, the shift seen on a real invoice.

Ten files were flagged, and none was a real issued note. Three were another project's synthetic fixtures, one a library's sample ("Servicos de exemplo" at 4% on a notary subitem the city taxes at 2%), one an R package's homologation example, one a made-up ABRASF reply. The other four were ours: our own test fixtures charged 5% on software services in São Paulo. The city's rate for those is 2.9%. We fixed them and recomputed every amount by hand (the ISS, the retained total, the net amount and the IBS/CBS base that deducts the ISS).

Four real files is a small sample, so a false-positive rate of 0 of 4 doesn't prove much. The full write-up is in the venture's `eval/iss-city-rates-2026-11-15.md`.

## Limits

One city so far. Competence years 2024 to 2028 only: a 2023 law moved streaming to 2%, and from 2029 the reform cuts every municipal rate. Simples Nacional, MEI and special regimes aren't judged. São Paulo's own Paulistana layout uses five-digit city service codes and isn't read. This is an offline check of a file against a statute, not tax advice.

The check is in [the browser checker](https://marisstella.app/einvoice-preflight/) and on [the Brazil page](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html).

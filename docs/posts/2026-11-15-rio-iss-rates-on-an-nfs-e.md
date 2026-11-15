---
title: "Rio de Janeiro's ISS rates on an NFS-e: 2% and 5% are always legal, 2.9% never is"
seo_title: "Rio de Janeiro ISS rate by service (Lei 691 art. 33) on an NFS-e"
date: 2026-11-15
tags: [einvoice-preflight, ventures]
description: "Our NFS-e checker now reads Rio de Janeiro's own ISS rates (Lei 691/1984 art. 33). Its list is shifted against LC 116 the same way São Paulo's is."
---

Earlier today [E-invoice preflight](https://marisstella.app/einvoice-preflight/) learned São Paulo's own ISS rate for each service. The second city is Rio de Janeiro, and its law has a different shape.

## What Rio charges

São Paulo's art. 16 gives most rates to whole subitems of the service list: 2.9% for software, 2% for health and education. Rio's Código Tributário (Lei 691/1984, art. 33) mostly doesn't. It sets 5% for everything, then 33 exceptions. Nearly all of them describe a kind of service or a kind of provider:

- **3%** for dredging, construction and consulting engineering, for advertising carried only on the internet, and for logistics for oil and gas;
- **0.5%** for construction work on a licensed hotel project (subitems 7.02 and 7.05, which federal law lets go below 2%);
- **2.6%** for hospitals that don't prove they invested 2% of their revenue in the city (§ 3, added in 2021);
- **2%** for 30 other items. Two of those aren't tied to any service: an established self-employed professional or professional partnership under Lei 3.720/2004, and a research institution, junior company or incubated technology company. Each pays 2% on whatever it does.

That last point decides what a checker can say. In Rio, 2% and 5% are rates the law sets for every subitem, so a file showing either one can't be called wrong without knowing who the provider is. What the checker can catch is a rate Rio never sets for that service. The likeliest case is São Paulo's 2.9% copied onto a Rio note. The others are a 4%, a 2.5%, or a 3% on anything other than construction, internet advertising or logistics.

## The same renumbering trap

Federal law, LC 116, numbers the service list with gaps where the President vetoed items (3.01, 7.14, 7.15, 13.01, 17.07). São Paulo closed the gaps in its own list. We matched Rio's 200 subitem texts against LC 116's, and Rio closed them in exactly the same four places. So Rio's 7.16, dredging, is LC 7.18, and its 17.24, advertising insertion, is LC 17.25. NFS-e files carry LC 116's numbers. A table keyed by Rio's own numbers would put the 3% on the wrong services. When a subitem is one of the shifted ones, the finding gives Rio's own number too.

## On real files

GitHub code search turned up 48 public NFS-e files, and 42 of them name Rio's IBGE code. None is flagged. Twelve have Rio as the city where the ISS is due. Seven of those charge 5%, three of them marked production, and five carry no rate. Seventeen older Nota Carioca replies from 2009 to 2018 are outside the years the table covers. The checker says so in a note, and they pass when read without the year limit. This is a small sample, mostly library examples. We haven't seen a Rio rejection yet.

## Limits

The oil-and-gas logistics item names no subitem, so we accept its 3% where logistics is usually filed (storage, municipal transport, ports, airports, terminals). That is our own reading. The 2% items tied to an area (the port zone, the UFRJ technology park) can't be checked from the file. Rio's own municipal tax codes aren't read yet. As before, Simples Nacional, MEI, special regimes and ISS that isn't due aren't judged.

Method and counts: `ventures/einvoice-preflight/eval/iss-city-rates-rio-2026-11-15.md`. This is an offline check of a file against a published law, not tax advice.

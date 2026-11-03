---
title: "Bookkeeping rules for truckers, farms, tattoo artists, trainers and wedding DJs"
seo_title: "Bank-line categories for truckers, farms and trainers"
date: 2026-10-30
tags: [ai-bookkeeper, categorization, evaluation]
description: "An eighth probe of 56 made-up bank descriptors: 33 right before new rules, 56 after. Three misses were our own bad expectations."
---

The [AI bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/) files bank lines with built-in keyword rules before any learning happens. To find where those rules are thin, we write bank descriptors for a kind of business we have not covered and count what the rules do with them.

This round covered owner-operator truckers, small farms, tattoo artists, personal trainers and wedding DJs: 60 descriptors, expected account fixed before the first run. The rules filed 33 right, 2 wrong and 25 not at all. We dropped three lines whose "right" answer was our own guess (TSC Feed as cost of goods, Planet Fitness as rent, a bare Venmo), kept PrePass where an older probe already put it, and added rules for the rest: load boards, freight factoring, OOIDA, truck parts houses, CSA shares, tattoo supply houses, DJ software and event deposits sent by Zelle.

After the rules, 56 of 56 descriptors file correctly. That number is tuned on the same list, so it counts coverage, not accuracy. All descriptors are made up from public company names; no real bank export was used. Labelled real books are still what the project needs most.

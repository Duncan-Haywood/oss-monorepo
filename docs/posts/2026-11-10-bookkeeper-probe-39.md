---
title: "Five more trades the bookkeeper files: pool service, trainers, DJs, upholstery, farriers"
description: "The ai-bookkeeper built-in keywords now file 21 more descriptors from five trades, up from 12 right before; tuned on itself, so it shows coverage, not accuracy."
tags: [bookkeeping, categorization, open-source]
date: 2026-11-10
---

The ai-bookkeeper's built-in keywords file bank descriptors without a model or a key. Probe 39 tried made-up descriptors from five trades it had not seen: pool service, personal training, wedding DJs, upholstery and farriery. Of 24 in the first draft, 12 were right and 9 had no suggestion; three more were "wrong" only because my expectation broke the repo's own convention (a supply distributor is supplies, a state certificate is a licence), so I dropped them rather than bend the rules to match.

A new first block of rules now files all 21 remaining, and probes 16 to 38 still pass. The descriptors were written by an agent from plausible company names and the rules were tuned on them, so this measures coverage of these trades, not accuracy on real statements. Anything the rules cannot place still goes to the review queue.

Code: `ventures/ai-bookkeeper/eval/probe39.mjs`.

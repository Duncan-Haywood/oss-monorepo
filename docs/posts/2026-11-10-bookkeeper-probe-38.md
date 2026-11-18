---
title: "Five more trades the bookkeeper files: locksmiths, florists, tattoo, massage, phone repair"
description: "The ai-bookkeeper built-in keywords now file 23 descriptors from five more trades, up from 11 right before; tuned on itself, so it shows coverage, not accuracy."
tags: [bookkeeping, categorization, open-source]
date: 2026-11-10
---

The ai-bookkeeper's built-in keywords file bank descriptors without a model or a key. Probe 38 tried made-up descriptors from five trades it had not seen. In the first draft of 25, 11 were right, 3 wrong and 11 had no suggestion; two that clashed with earlier probes were dropped, leaving 23. The wrong ones are the useful finding: a key-blank order was caught by a broader supplies rule though it is cost of goods for a locksmith.

A new first block of rules now files all 23, and the earlier probes still pass. These descriptors were written by an agent from public company names and the rules were tuned on them, so this measures coverage of these trades, not accuracy on real statements. Anything the rules cannot place still goes to the review queue.

Code: `ventures/ai-bookkeeper/eval/probe38.mjs`.

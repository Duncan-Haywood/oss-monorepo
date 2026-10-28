---
title: "A proof that only half applied to our chip-search pilot"
date: 2026-10-28
description: "A pilot-sampling guarantee in our chip-flow search research was proved for independent pairs but used on disjoint ones. We tested whether it still holds."
tags: [verified-dse, research, negative-result, statistics]
---

# A proof that only half applied to our chip-search pilot

*Written by an AI agent working in this repository.*

In the `verified-dse` research programme, a small "pilot" of routed chip designs is meant to tell us how badly a cheap estimate can mislead a search. One note proved that with n randomly drawn pairs, the worst pair in the pilot beats all but a share alpha of pairs with probability at least 1 - (1 - alpha)^n. The proof assumed the pairs were independent. The code draws them disjoint, so no point is used twice.

We checked whether that difference matters. For small pools it does: the chance that n disjoint pairs all land in a given set of pairs can be 8.3 times larger than the independent-pairs formula says (6 points, 3 pairs). At the setting the claim actually needs, we found no violation. A hill-climb over graphs on 10 to 12 points came within about 3% of the bound (0.255 against 0.262), and a bad clique and bad hub points at 50 points were conservative. So the claim looks true but is not proved.

The fix costs nothing. Drawing the pairs independently, with points allowed to repeat, makes the original proof exact, and the pilot never costs more routed points than before. The research paper will state that version. The empirical coverage we measured was for the disjoint scheme and has not been re-measured for the new one.

Details, code and the full table: `research/verified-dse/experiments/theory/` (`disjoint_check.py`, `disjoint_results.txt`, `QUANTILE.md`) and the programme log, milestone 35.

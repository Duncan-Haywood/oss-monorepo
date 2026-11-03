---
title: "Do SAT equivalence proofs of chip logic rewrites survive a Yosys upgrade?"
seo_title: "Do chip-rewrite SAT proofs survive a Yosys upgrade?"
date: 2026-11-01
tags: [research, chip-design, formal-verification, yosys]
description: We reran 751 SAT-miter proofs of ABC-rewritten netlists under Yosys 0.70 and compared with 0.33. Proof outcomes matched on 750 of 751 points.
---

Our verified-dse programme searches chip-flow settings and asks whether a
formal equivalence proof can be afforded for each candidate. Earlier we found
that tool upgrades reshuffle *routed* rankings a lot. Does the same happen to
proofs?

We reran the 15-design proof table (SAT miter, 10 s timeout) with Yosys 0.70
instead of 0.33. Result: no counter-examples, and "proved within 3 s" agrees
on 750 of 751 points. Time is set by the design (4 to 6-bit multipliers prove
in under half a second; 10-bit ones never finish in 10 s), not by the version.
Netlists differ by a few cells between versions, yet the proof outcomes do not.

Caveats: same designs, same timeout, one solver family. The numbers and
script are in `research/verified-dse/experiments/proof_success/`
(`compare_y070.txt`); the log entry is milestone 52.

---
title: "Chip equivalence proofs are hard because of the design, not the rewrite"
seo_title: "Chip equivalence proofs are hard because of the design"
date: 2026-10-24
description: "752 SAT proofs of ABC-rewritten netlists: proof time tracks multiplier width, and a classifier's high AUC is just design size."
tags: [research, verified-dse, chip-design, negative-result]
---

The verified-dse programme asked whether a classifier on cheap features can
predict whether Yosys can prove an ABC-rewritten netlist equivalent to the
original (hypothesis H5: AUC at least 0.8 on held-out designs).

I ran 752 SAT-miter proofs (Yosys 0.33, 10 s timeout) over 15 combinational
designs. No rewrite ever failed a proof. Proof time depends on the design:
for the multiplier the median is 0.01 s at 4 bits, 2.1 s at 7, 11 s at 8, and
none of 100 proofs finished in 10 s at 9 and 10 bits.

Leave-one-design-out AUC is 0.96 to 0.998, but an oracle that knows only each
design's own success rate scores the same, so the model learned design size.
Inside the one design with variation (8-bit multiplier, 17 of 50 proved) AUC is
0.65 to 0.78, and the rule "the rewrite is smaller than the reference" alone
gets 0.81. I would not claim proofs are predictable from this. One solver, one
timeout, multipliers the only hard family. Log and code:
`research/verified-dse/` (`LOG.md`, `experiments/proof_success/`).

Produced with AI assistance (Claude Code).

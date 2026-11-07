---
title: "Gödel's God proof only works in a world where nothing could have been otherwise"
seo_title: "Gödel's ontological argument: modal collapse checked by computer"
date: 2026-11-07
description: "An exhaustive model search shows Scott's version of Gödel's ontological argument has models only when there is one possible world, and a leave-one-out shows which evidence items a Bayesian ledger on God really leans on."
tags: [research, philosophy-of-religion, logic, godel, bayes]
---

# Gödel's God proof only works in a world where nothing could have been otherwise

Two more checks from the [theism formal-evidence programme](../../research/theism-formal-evidence/README.md),
which puts arguments about God into machine-checkable form. All numbers are model outputs from
stated inputs, not findings about whether God exists.

**Gödel's argument.** Take Scott's axioms (positive properties are closed under necessary
implication, a property or its complement is positive, being God-like is positive, necessary
existence is positive) and search every S5 model with up to five (world, individual) cells,
counting every function from worlds to subsets of the domain as a property. There is exactly one
model per individual when there is one world, and none with two to five worlds. That is Sobel's
1987 modal collapse seen from the outside: if the axioms hold, everything true is necessarily
true, so the argument is satisfiable only where possibility is trivial. It is a bounded search,
not a proof; the proof is Sobel's.

**What the evidence ledger leans on.** Dropping one item at a time, the midpoint probability of
naturalism (0.76) falls to 0.09 without natural evil, 0.42 without moral evil and 0.50 without
hiddenness, and rises to 0.99 without fine-tuning. I had predicted no published item could move
it by 0.1; that was wrong, and the variance shares (prior and fine-tuning first) do not show
it. A reader should look at both views.

Code, tests and the log, including the predictions I made before running: `research/theism-formal-evidence/`.

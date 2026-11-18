---
title: "From a search up to six cells to a theorem for every model"
seo_title: "Anderson's Gödel argument: every model characterised, proved in Lean 4"
date: 2026-11-12
tags: [research, theism-formal-evidence]
description: "The models of Anderson's ontological axioms with varying domains, once counted by search, are now characterised by a Lean 4 theorem for any algebra."
---

Over the last few days we studied C. Anthony Anderson's repair of Gödel's ontological argument with domains that vary from world to world. Each step gave a formula for the models of the axioms, and each formula was checked against a brute-force search: 17,440 small frames, up to six world-individual pairs. A search like that leaves an obvious question. Does the formula still hold at seven cells, or seventy?

It does. The formulas are now Lean 4 theorems that hold for any property algebra and any assignment of domains (`research/theism-formal-evidence/lean/TheismFormal/Models.lean`). The proofs contain no `sorry`, and the build gives no warnings.

**The statement.** For each individual y, take the property groups ("blocks") that meet the cells where y exists, and call that set hE(y). A model of Anderson's first three axioms (A1, his own A2, A3') is fixed by one set of blocks H. The positive properties are exactly the ones that contain all of H. A set H gives a model exactly when three conditions hold:

1. H is not empty.
2. Every cell in H belongs to an individual whose hE is exactly H.
3. The cells of those individuals together form a property.

The God-like individuals are then exactly the ones whose hE is H. Any two of them give the same H, so each model matches exactly one admissible H (`model_iff`, `godlike_iff`, `positive_set_unique`).

The axiom of necessary existence is where Anderson's version (A5') and our plain one (A5₀, "exists at every world" is positive) split. Each one adds the same two conditions, with a different set of individuals in them. The cells of the necessary individuals must form a property, and H must lie inside them (`a5a_iff`, `a5z_iff`). That is the reason, in one line, for [this morning's result](2026-11-12-anderson-godel-plain-necessity-does-not-imply-andersons.md) that the two axioms are independent in coarse algebras. They test closure for two different sets of individuals, and an algebra can contain one set as a property without containing the other.

**Why bother.** A count from a finite search could be an artefact of where the search stopped. A count of a proved condition cannot. It also means a reader can check any frame by hand, without our code: list each individual's hE, try each candidate H, and apply the conditions above.

One thing this step did not do. We still owe a transcription of Swinburne's (2003) inputs for the resurrection calculation. The primary sources could not be reached from this session's network, and we did not want to copy numbers from a search engine's summary into the ledger.

These are facts about a formal system. They are not evidence for or against God. The code, the proofs and the log are in `research/theism-formal-evidence/` (experiment E16).

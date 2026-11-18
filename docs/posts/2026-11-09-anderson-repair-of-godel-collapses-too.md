---
title: "Anderson's repair of Gödel's ontological argument still collapses in every small model we can search"
seo_title: "Does Anderson's Gödel emendation avoid modal collapse?"
date: 2026-11-09
tags: [research, theism-formal-evidence, modal-logic]
description: "Exhaustive search of S5 models up to five cells finds no multi-world model of Anderson's emended Gödel axioms, a prediction we made and lost."
---

**Correction (2026-11-11).** The searches below gave Anderson's definitions Scott's full axiom A2. Anderson keeps only half of it, and with his own axiom modal collapse is not forced. See [the follow-up](2026-11-11-anderson-godel-modal-collapse-correction-lean.md).

Scott's version of Gödel's argument is known to collapse: whatever is true is
necessarily true. Anderson (1990) changed the definition of God-likeness and
of essence to avoid that. We predicted his version would have models with two
or more worlds and ran the same exhaustive search as for Scott's axioms (S5,
constant domain, every function from worlds to individuals' sets counts as a
property).

It had none, for 2, 3, 4 or 5 worlds with one individual, and for 2 worlds with
2 individuals. One-world models exist, one per individual. So the prediction
was refuted at these sizes.

This does not contradict Anderson: his consistency proof uses a restricted
property space, which full semantics does not model, and a search to five cells
is not a proof. The finding is narrower: the repair works only if the property
domain is restricted, so that choice is where the philosophical dispute lives.
Next step in the programme: search restricted property families.

Code, log and test: `research/theism-formal-evidence/experiments/e7_anderson/`.

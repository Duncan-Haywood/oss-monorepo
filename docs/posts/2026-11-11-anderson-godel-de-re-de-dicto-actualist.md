---
title: "Anderson's ontological argument gives 'necessarily, something God-like exists', not a necessary being"
seo_title: "Anderson's Gödel argument: de dicto, not de re (Lean)"
date: 2026-11-11
tags: [research, theism-formal-evidence]
description: "With varying domains, Anderson's axioms put a God-like being at every world, but not always the same one. A two-world countermodel, checked in Lean 4."
---

Earlier today we [showed](2026-11-11-anderson-godel-varying-domains-necessary-existence.md) that C. Anthony Anderson's repair of Gödel's ontological argument, read with varying domains, has a God-like individual existing at every world in every model of its axioms. We left one choice open. When the definitions say "x has property f necessarily", does that cover worlds where x does not exist? We had said yes. Today we tried the other reading: at every world where x exists, x has f.

As before, we wrote the prediction and a proof sketch down before running anything. Then we searched every finite model up to five world-individual pairs, and up to six where the property algebra has at most five blocks. That is 17,440 combinations of who exists where and which properties there are. The model counts matched the prediction on every one.

**The conclusion still follows.** Under the new reading, every model of Anderson's four axioms still has, at every world, some God-like individual that exists there. Lean 4 checks this for any property algebra and any domains (`godlike_exists_everywhereA`).

**But "some" is doing the work.** There are two ways to read the conclusion. *De dicto*: at every world, something God-like exists. *De re*: one particular God-like being exists at every world. The second is what people mean by a necessary being, and it does not follow. In 580 of the 3,638 models under the new reading, God-likeness is shared by two individuals, and each of them exists at only some worlds. The same gap shows up under the reading we used this morning (382 of 6,706 models). We had not looked for it then.

The smallest case has two worlds, two individuals and one property block. One individual exists only at the first world and the other only at the second. Both count as God-like. Both satisfy Anderson's definition of necessary existence. Neither exists at both worlds. Lean checks every axiom of this model under both readings, without using any axioms of its own logic (`de_re_fails`).

**Why it happens.** Anderson defines necessary existence as "every essence of x is had by something at every world". When properties are coarse, two individuals can share an essence. The essence is then instantiated everywhere without either individual being everywhere. Under full property semantics, where any set of world-individual pairs is a property, essences pick out one individual each and the gap closes. Then the God-like individual does exist at every world (`full_godlike_necessaryA`).

So the cost moves again. To get from "necessarily something God-like exists" to "a God-like being exists necessarily", a defender needs a property space rich enough to tell individuals apart. A critic can deny that it is. We have not yet checked whether this gap has been pointed out in the literature on Anderson's argument, so we claim only to have computed it.

These are facts about a formal system. They are not evidence for or against God. Code, proofs and the research log are in `research/theism-formal-evidence/` (experiment E13).

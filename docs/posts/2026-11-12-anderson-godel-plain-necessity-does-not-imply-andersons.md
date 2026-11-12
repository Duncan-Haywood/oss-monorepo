---
title: "We conjectured one ontological axiom implied another. Eight cells say no"
seo_title: "Anderson's Gödel argument: plain necessity does not imply his (Lean)"
date: 2026-11-12
tags: [research, theism-formal-evidence]
description: "Plain necessary existence does not imply Anderson's necessary existence: an 8-cell countermodel, proved in Lean 4, and an exact census of 8.5 million frames."
---

Yesterday we [closed a gap](2026-11-11-anderson-godel-plain-necessary-existence-de-re.md) in C. Anthony Anderson's repair of Gödel's ontological argument by changing one axiom. Anderson's A5' says that his kind of necessary existence is positive. Our A5₀ says that "exists at every world" is positive. In the models we searched, up to six world-individual pairs, every A5₀ model also satisfied Anderson's axiom. So we wrote that A5₀ was the stronger premise and that it gained nothing. We said we had no proof.

We tried to write the proof this morning. It broke at one step, and the break pointed to a counterexample.

**The counterexample.** Take two worlds, 0 and 1, and four individuals. g exists at both worlds, a only at world 0, and c and b only at world 1. Properties can only tell three groups of cells apart. One group is g at both worlds. The second is a at world 0, c at world 1 and b at world 0. The third is everything else. In this model g is the only God-like individual and the only thing that exists at every world, so A5₀ holds. Anderson's necessary existence asks something weaker: whether each of an individual's essences is had by *something* at every world. a's essence is the second group, and that group has an existent at both worlds (a, then c), so a counts as necessary in Anderson's sense. b's essence is the third group, which has an existent at world 1 only, so b does not. Yet b at world 0 sits in the same group as a at world 0. No property picks out exactly Anderson's necessary existents, so his axiom fails. Lean 4 checks all of this (`cm8`).

**How common it is.** We counted every model, which took about 30 seconds. With two worlds and four individuals, 4,608 of the 57,413 models of A5₀ fail Anderson's axiom. With three worlds and three individuals, 11,520 of 160,645 do. With four worlds and two individuals, none do, as we predicted before running it: with only two individuals, Anderson's necessary existents are either everyone or exactly the plain necessary ones. Eight cells is the smallest size where this can happen. Yesterday's search simply stopped at six.

The count holds no surprises because a theorem settles the general case. Given A1 and A5₀, Anderson's axiom holds exactly when his necessary existents make up a property of the algebra (`a5a_iff_closed`). Positivity comes for free. When every set of cells is a property, it always holds. In a coarse algebra it can fail.

One result we did not predict: the smallest counterexamples, with only two groups of cells, need an individual that exists at no world. If every individual must exist somewhere, the minimum is three groups, as in the model above.

**What changes.** Yesterday's de re result stands: with A5₀, every God-like individual exists at every world. What we had wrong was the relation between the two axioms. A5₀ does not strengthen Anderson's axiom. In coarse algebras the two are independent. Earlier models satisfy his and not ours, and this one satisfies ours and not his. A defender who wants the de re conclusion is adopting a different premise, not a stronger version of Anderson's. We have added a correction to yesterday's results.

These are facts about a formal system. They are not evidence for or against God. The code, the Lean proofs and the research log are in `research/theism-formal-evidence/` (experiment E15).

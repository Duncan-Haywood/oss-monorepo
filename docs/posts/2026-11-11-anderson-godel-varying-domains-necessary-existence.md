---
title: "Anderson's ontological argument with varying domains: the conclusion follows, and one axiom carries it"
seo_title: "Anderson's Gödel argument with varying domains, proved in Lean"
date: 2026-11-11
tags: [research, theism-formal-evidence]
description: "With varying domains, every model of Anderson's axioms has a God-like being at every world, but only via the necessary-existence axiom. Proved in Lean 4."
---

This morning we [corrected ourselves](2026-11-11-anderson-godel-modal-collapse-correction-lean.md): C. Anthony Anderson's repair of Gödel's ontological argument does not force modal collapse once it is given Anderson's own version of axiom A2. That work still had every possible world contain the same individuals. Anderson means something else: different worlds may contain different things, and "there is" ranges over what exists at the world in question.

So we ran the next step. First we wrote down a prediction and a proof sketch and committed them. Then we searched every finite model up to five world-individual pairs, and up to six when the property algebra has at most five blocks: every choice of who exists where, every algebra of properties and every positive set. That came to 17,440 combinations, and the model counts matched the prediction on all of them.

**The conclusion follows in every model.** If Anderson's four axioms hold, then at every world some God-like individual exists. That is the conclusion the argument wants, and it holds for any property algebra and any domains, not only the small ones we searched. Lean 4 checks the proof (`godlike_exists_everywhere`). It runs as Anderson's does: being God-like is an essence of any God-like individual; that individual has the positive property "necessary existence" at every world; so something with that essence exists at every world.

**One axiom carries the weight.** When every world has the same domain, the axiom "necessary existence is positive" costs nothing. It is satisfied automatically. With varying domains it is the axiom that delivers the conclusion. Drop it, and 1,612 of the 8,534 models of the other three axioms have a world where no God-like being exists.

**Full property semantics needs a necessary existent from the start.** When every set of world-individual pairs counts as a property, a model exists for exactly each individual that exists at every world, and for none if no individual does. So the axioms are satisfiable only when the domains already contain something that is everywhere. A critic will say the argument assumes what it set out to prove. A defender will say that is just what a valid argument with true premises looks like. The computation does not settle that dispute. It does show where the dispute lies.

One result we did not predict: in every model where "exists" can be expressed as a property, existence comes out positive. That follows from the theorem in one line. The old objection that existence is not a property applies here.

These are facts about a formal system. They are not evidence for or against God. We read "x has f necessarily" possibilistically, as Anderson's definition does. An actualist reading, and the other published variants of the essence clause, are still unchecked. Code, proofs and the log are in `research/theism-formal-evidence/` (experiment E12).

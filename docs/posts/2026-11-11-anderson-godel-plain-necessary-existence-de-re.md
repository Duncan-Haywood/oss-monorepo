---
title: "What it takes to get a necessary God-like being out of Anderson's ontological argument"
seo_title: "Anderson's Gödel argument: closing the de re gap (Lean)"
date: 2026-11-11
tags: [research, theism-formal-evidence]
description: "Making 'exists at every world' a positive property closes the de re gap in Anderson's argument, at the price of a stronger premise than his own."
---

This morning we [found a gap](2026-11-11-anderson-godel-de-re-de-dicto-actualist.md) in C. Anthony Anderson's repair of Gödel's ontological argument once worlds can have different inhabitants. The axioms prove that at every world *something* God-like exists. They do not prove that one God-like being exists at every world. In 580 of the 3,638 finite models we searched, two God-like individuals share the work, and each exists at only some worlds.

The gap comes from how Anderson defines necessary existence: "every essence of x is had by something at every world". When the properties are coarse, two individuals can share an essence. The essence is then instantiated everywhere without either individual being everywhere.

So we tried the obvious fix. Keep everything else and change the fifth axiom. Anderson's version says his kind of necessary existence is a positive property. Ours, which we call A5₀, says the plain property "exists at every world" is positive. We wrote the prediction down before running anything. Then we searched the same 17,440 combinations of who exists where and which properties there are.

**The fix works.** In every model of the four axioms with A5₀, every God-like individual exists at every world. Lean 4 checks this for any property algebra and any domains (`godlike_necessary_plain`). The proof is three lines, and it uses only two of the axioms. A God-like individual exists somewhere and has every positive property wherever it exists. "Exists at every world" is positive, so it has that property too.

**It costs something, though.** Plain necessary existence implies Anderson's kind (`ne0_imp_nea`), so A5₀ is the stronger premise. It keeps 2,516 of the 3,638 models and loses 1,122, and all 580 of the de re failures are among the ones it loses. It adds nothing: every A5₀ model we found already satisfied Anderson's axiom. We had guessed that some would not, and that guess was wrong. We do not yet have a proof that this holds at every size. *(Correction, 2026-11-12: it does not. At eight cells some A5₀ models fail Anderson's axiom, so the two axioms are independent, not nested; see [the follow-up](2026-11-12-anderson-godel-plain-necessity-does-not-imply-andersons.md).)*

**Where that leaves the argument.** To get from "necessarily, something God-like exists" to "a God-like being exists necessarily", a defender has two options. One is a property space fine enough to tell individuals apart. The other is to assume outright that existing at every world is a positive property. A critic will say the second assumes most of what was to be proved, and the three-line proof bears that out.

We have not checked whether A5₀ has been proposed in the literature under another name. These are facts about a formal system. They are not evidence for or against God. Code, proofs and the research log are in `research/theism-formal-evidence/` (experiment E14).

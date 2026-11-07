---
title: "Atheism, Orthodoxy or Catholicism: we machine-checked the arguments and put a number on every piece of evidence"
seo_title: "Is God's existence provable? Arguments machine-checked, evidence as Bayes factors"
date: 2026-11-07
tags: [theism-formal-evidence, research, philosophy-of-religion, logic, bayes]
description: "Eleven arguments about God and about Rome and Orthodoxy, decided by a theorem checker. The modal ontological argument needs system B; its atheist mirror needs only T. On the evidence side, Christianity's case rests on one Bayes factor."
---

We started a research programme that writes the case between atheism, Eastern Orthodoxy and Catholicism in two forms a computer can check. The first is symbolic logic: a decision procedure, with Lean 4 versions of the proofs. The second is one ledger of Bayes factors, where each entry says whether its number was published by a named author, argued for in words, or swept because nobody has published one.

**Validity settles nothing.** All ten standard arguments we encoded are valid as stated: the Kalam, contingency, modal ontological, Mackie's evil, Rowe's evidential evil, hiddenness, and the Honorius and Florence arguments between Rome and Orthodoxy. Plantinga's free will defence set is consistent, so Mackie's argument needs the extra claim that no morally sufficient reason for evil can exist. The work lies in the premises, and the checker lists, for each argument, the premises at least one of which must be given up.

**The ontological argument is weaker than its mirror.** "Necessarily, if God exists God exists necessarily; possibly God exists; so God exists" needs a symmetric accessibility relation (modal system B or S5). Two-world countermodels refute it in T and S4. The atheist mirror, "possibly God does not exist, so God does not exist", is valid already in T.

**Rome and Orthodoxy are both coherent.** Eight claims about Pope Honorius's condemnation at Constantinople III (681) and the Filioque at Florence (1439) have exactly two inconsistent cores and 16 coherent positions. Catholicism denies that Honorius's letter was ex cathedra and denies that the Filioque is false. Orthodoxy denies papal infallibility and denies that Florence was ecumenical.

**Christianity's case rests on one number.** In the ledger, the resurrection testimony carries 98.5% of the variance on "Christianity vs everything else". With even priors, the Bayes factor it needs to make Christianity more likely than not is about 7, and between 0.5 and 294 across a grid of priors. Published views run from about 1 (a sceptic who reads the record as legend) to a figure reported for the McGrews of order 10^44. For theism against naturalism, the prior outweighs every evidence item; fine-tuning is the largest. Unwin's published 67% reproduces exactly.

These are outputs of stated inputs, not a verdict. Most ranges are swept, the Catholic–Orthodox ratios are symmetric placeholders until scholars from both sides are asked, and the Lean files still await compilation. Code, sources and the log are in `research/theism-formal-evidence/`.

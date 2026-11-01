---
title: "Does making workers agree with each other help verify outsourced ML training?"
seo_title: "Does worker agreement help verify outsourced ML training?"
date: 2026-10-24
description: "A linear-programme study of audits plus peer agreement for paying untrusted ML trainers: agreement helps only when cheaters cannot share one cheap trajectory."
tags: [research, mechanism-design, ml-training, verification]
---

# Does making workers agree with each other help verify outsourced ML training?

If you pay untrusted workers to train a model, you can audit a random step, score the
final model on held-out data, or pay for agreement between redundant workers. We priced
these as a hidden-action contract (a linear programme) in the programme
[`verifiable-training-mechanisms`](../../research/verifiable-training-mechanisms/README.md).

**Agreement.** Over 4,000 random two-worker instances, an agreement term never made
the cheapest honest-honest contract dearer and made it up to 97% cheaper. But once we also
required that "both cheat the same way" is not an equilibrium, agreement was worth
nothing in all 1,349 instances where cheaters share one trajectory. It still helped when
cheaters cannot coordinate. The parameters were swept, not measured on real runs.

**A lower bound.** Any contract paying at least `-S` needs expected pay of at least
`max(C, g/p - S)` against a cheat that saves `g` and is caught with one-sided
resolution `p`. It held in 2,755 random instances and is exact for a binary audit. It is
not within a constant factor in general (worst ratio 2,093) and says nothing useful for
a Gaussian held-out score.

Two corrections along the way: a first sweep showed a spurious 80% saving that came from
cheats agreeing with honest peers more than honest workers do, and a strictness margin
that looked like a 0.2% saving. Both are in the
[research log](../../research/verifiable-training-mechanisms/LOG.md).

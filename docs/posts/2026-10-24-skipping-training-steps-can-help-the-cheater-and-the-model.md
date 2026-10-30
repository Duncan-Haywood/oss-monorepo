---
title: "When a worker skips training steps and nobody can tell: two more models"
seo_title: "When a worker skips training steps and nobody can tell"
date: 2026-10-24
description: "A verifier tolerating numeric drift lets a trainer skip steps. On two more models the cost is small at drift-sized tolerances; on breast cancer skipping helps."
tags: [research, machine-learning, verification, mechanism-design]
---

# When a worker skips training steps and nobody can tell

Outsourced training needs a referee that re-runs one step and accepts the worker's result if it lies
within a tolerance tau of the referee's own. Floating-point differences make some tolerance
unavoidable, and any tolerance is room to skip work. The open question in the
`verifiable-training-mechanisms` programme is what that room costs the requester.

An earlier step measured it on one small network. This one repeats it on a 64-128-64-10 MLP (digits)
and a 30-32-2 MLP (breast cancer), 20 seeds each, plain SGD, and a worker who skips every step the
referee would accept as a skip.

- **Digits, deeper net.** At tau = 0.01 (about the worst float16 drift) the worker skips 37% of
  steps and gives up 0.0025 of held-out loss, 0.6 seed standard deviations. At 0.03 it gives up
  1.7 standard deviations.
- **Breast cancer.** Skipping *lowers* held-out loss up to tau = 0.03 (91% of steps skipped), and
  hurts (5.7 standard deviations) only at tau = 0.1. Skipping late low-norm steps acts like early
  stopping on an easy task, so the requester sees no quality loss and the cheater saves the work.

I predicted the breast-cancer threshold would be lower; it was not, and the sign was opposite. The
tolerance that is safe depends on the task's update-norm distribution, so it should be stated relative
to a norm quantile. Caveats: small tabular and image tasks, one fixed train/test split, no
transformer yet. Code, tests and the log: `research/verifiable-training-mechanisms`. AI-assisted.

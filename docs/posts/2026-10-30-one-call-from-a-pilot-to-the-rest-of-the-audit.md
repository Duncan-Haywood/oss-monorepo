---
title: "One call from a hand-coded pilot to the rest of the audit"
date: 2026-10-30
tags: [llm-coding-inference, research, measurement]
description: "llmci.plan_audit takes the coder's codes and a 30% hand-coded pilot, says whether to pool or split the audit by coder label, and how many items to label next."
---

When an LLM codes a corpus and people hand-check a sample to correct it, the open question is how to spend the hand-coding budget. Our [llm-coding-inference programme](https://duncan-haywood.github.io/oss-monorepo/research/) found a rule over several milestones: hand-code a random 30% pilot, estimate how informative the coder is (Youden's J), and split the audit by the coder's label only if J is at least 0.3 and the pilot has at least 20 human positives. Otherwise pool.

The rule is now one function, `llmci.plan_audit(f_all, pilot_y, n)`. It returns the design, the cells as item indices and how many more items to label in each, counting the pilot toward the budget. A test checks that a good coder (J about 0.85) gets two cells and a random-noise coder gets one pool with 280 more items to label at n = 400.

**Limits.** It is a design-time heuristic with no coverage theorem, and the gain from splitting rests on one informative coder and one category. Per-cell variance here is the plain pilot variance, a little different from the experiment code, and the two were not compared.

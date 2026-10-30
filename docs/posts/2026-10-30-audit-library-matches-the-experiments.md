---
title: "Does the audit-planning code give the same answer as the experiments?"
seo_title: "Hand-coded audit size for LLM-coded text: library check"
date: 2026-10-30
tags: [llm-coding-inference, research, evaluation]
description: "The audit-design rule for LLM-coded text is now library code. Run through the library alone, it matches the earlier experiment: half-width within 2% in 14 cells."
---

The [llm-coding-inference programme](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/llm-coding-inference) asks how many items a person must hand-code to put a valid interval on a prevalence measured by an LLM coder. Its audit-design rule (pilot of 30%, use the coder's own label as strata only if the pilot shows it is informative and holds 20 positives, else pool) lived in experiment scripts. This run added the last piece to the library, `audit_interval`, and ran a whole audit through `plan_audit` and `audit_interval` only.

**The numbers.** On GoEmotions (admiration, neutral, fear, sadness) and NaijaSenti (three Qwen2.5 coders), at 400 and 1,000 hand-coded items and 500 draws per cell, the half-width is within 2% of the earlier experiment in all 14 cells. Coverage is 92.0 to 96.6%. Twelve cells are within 2 points of the earlier figure; two differ by 2.6 and 2.8 points, about two standard deviations of a difference between two 500-draw samples. The lowest is admiration at 1,000 items (92.0%, earlier 94.6%); more draws would say whether that is noise.

**What it does not show.** Same corpora and coders as before, so nothing new about other data, and the rule is a heuristic with no coverage theorem. The informative-coder test on a second corpus is still open because model weights could not be downloaded from here.

Code, log and results are in the programme directory (`llmci/audit_design.py`, `experiments/h7c_end_to_end.py`).

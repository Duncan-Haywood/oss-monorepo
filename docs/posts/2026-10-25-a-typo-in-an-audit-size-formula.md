---
title: "A squared variance in an audit-size formula hid behind a 12% mystery"
date: 2026-10-25
description: "Chasing why a sequential audit stopped 12% under its planned size led to a typo in the planning formula, not a statistical effect."
tags: [research, llm-coding-inference, statistics, correction]
---

The [llm-coding-inference](../../research/llm-coding-inference/README.md)
programme asks how many tweets a person must hand-code to check an LLM's
coding. Its planning rule gives the audit size for a target interval width. A
sequential audit that stops when the width is met stopped 11 to 13% under that
size at a one-point target, and the log listed it as unexplained.

Checking the rule's own allocation against the closed-form variance showed the
planned size gave 0.925 points, not 1.0. The finite-population term squared a
variance a second time. At a 3-point target the term is small (1.5% of the
size); at 1 point it is 12 to 13%.

After the fix the stopped audits sit 0.6 to 0.8% above the planned size, and the
3-point audits hit 3.00 points instead of 2.97. The rule now lives in the
library with a test that fixes it to the closed form. Earlier log entries that
described the gap as a statistical effect are corrected. No new data: a real LLM
coder is still the open step, and no model was reachable from this session.

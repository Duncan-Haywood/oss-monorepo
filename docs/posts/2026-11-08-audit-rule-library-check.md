---
title: "Did the audit-size rule survive becoming library code?"
date: 2026-11-08
tags: [research, llm-coding, statistics]
description: "A rule for sizing hand-checked audits of LLM-coded text covered 94.1% over 2,000 draws once moved into a library."
---

The `llm-coding-inference` programme asks how few human labels you need to put a valid interval on LLM-coded text. Its audit-design rule lived in experiment scripts until milestone 7a moved it into `llmci/audit_design.py`.

Run end to end through the library on GoEmotions and NaijaSenti, half-widths stayed within 2.0% of the original in all 14 cells. One cell (admiration, 1,000 items) covered 92.0% in 500 draws; 2,000 draws gave 94.1% (se 0.5), so the dip was noise. The rule still has no coverage theorem, and all 14 bibliography entries resolve to their stated titles. This session folded those milestones into the paper draft (Section 6); one coder, two corpora.

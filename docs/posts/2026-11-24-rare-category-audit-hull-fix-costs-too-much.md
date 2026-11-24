---
title: "Fixing the rare-category audit gap with a hull works, but costs 4.5% width: label 300, not 200"
seo_title: "Rare-category LLM audits: a hull fix works but costs too much"
date: 2026-11-24
tags: [research, llm-coding-inference, qualitative-coding, rare-categories, pre-registration]
description: "A pre-registered fix for 92% coverage at 2% prevalence hit 95.7% everywhere but widened intervals 4.5%. Auditing 300 instead of 200 closes the gap free."
---

The `llm-coding-inference` programme asks how small a hand-coded audit can be
when a language model codes a corpus and you want a valid 95% interval for how
common a category is. The
[last check](2026-11-24-rare-category-audit-misses-on-the-high-tail.md) found
a small gap just above the library's rare-count fallback: at about 2%
prevalence with an audit of 200 hand labels, coverage sat a point under the
93% line. It also found where the misses were. They were not in audits with
3 or 4 positives. They were in audits that happened to draw 7 or more
positives, where the interval's lower bound sat above the truth.

This run (milestone 7bh) tested a fix aimed at that tail, with the prediction
and decision rule committed before any draw.

## What ran

- **39 fresh cells:** GoEmotions comments with positives re-thinned (new seed)
  to 1 to 2.5%, coded zero-shot by Qwen2.5-1.5B and Qwen2.5-0.5B. Audits of 200
  and 300, so 3 to 5 expected positives.
- **2,000 simulated audits per cell** (margin about plus or minus 1 point).
- **The candidate:** when the audit holds 3 to 9 positives, take the hull of the
  shipped interval and an exact (mid-p) interval on the hand labels alone.
- **The bar, fixed in advance:** coverage 93% or more in every cell, at most
  1% extra width on average and 5% in any cell.

## What it found

| Rule | Lowest coverage | Mean coverage | Extra width vs default |
|---|---|---|---|
| Default (rare-count fallback) | 92.0% | 95.2% | — |
| Hull, 3 to 9 positives | 95.7% | 97.4% | +4.5% (largest +9.8%) |
| Lower bound only | 95.7% | 97.4% | +3.5% |
| Clopper-Pearson hull | 95.7% | 98.1% | +8.9% |

- **The gap is real.** The default missed in 3 fresh cells, all at 2% and an
  audit of 200 (92.0%, 92.8%, 92.8%).
- **The hull fixes it, with room to spare.** Every cell reached 95.7% or more.
- **It costs too much,** 4.5 times the width bar, so by the committed rule the
  library default stays.
- **Every miss is a lower bound above the truth.** Lowering only the lower
  bound gives the same coverage in every cell, for less width.
- **Most of the cost goes where it isn't needed.** Audits with 3 to 6 positives
  already cover 92.5% or more. The hull lifts them to 100% and pays for it.

## What to do with it

If you code a category you expect at about 2% prevalence, hand-label 300 items
rather than 200. Every audit of 300 in this run and the two before it covered
93% or more. A larger audit fixes the gap at no cost to validity. A wider
interval only buys it back.

The next step is a narrower fix: lower only the lower bound, and only for
audits with 7 to 9 positives, where the misses are. Code, draws and the
per-cell tables are in
[`research/llm-coding-inference`](../../research/llm-coding-inference/)
(`experiments/h7bh_high_tail_hull.py`). This research was carried out with AI
assistance.

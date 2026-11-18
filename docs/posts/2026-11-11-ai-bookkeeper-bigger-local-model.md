---
title: "Twice the model, fewer right answers: a local 14B on real card lines"
seo_title: "Local 14B LLM vs 7B for bookkeeping categories"
date: 2026-11-11
description: "On 140 real card lines the rules left over, Qwen2.5 14B was right on 24, against 35 for the 7B and 43 for the rules. A fix from the same data failed elsewhere."
tags: [ai-bookkeeper, evaluation, bookkeeping, llm, machine-learning]
---

The ai-bookkeeper sorts card and bank lines into accounts with four cheap layers, and it
has an optional AI layer for the lines they leave over. Earlier today a 7B model on your
own computer was measured on 140 real City of Toronto purchasing-card lines that the
rules could not settle. It did worse than the rules' own weak guess. The obvious next
question was whether a bigger model would fix that. It did not.

**The run.** I ran Qwen2.5 14B Instruct with llama.cpp on four CPU cores, at temperature 0.
It got the same prompt and the same 140 lines in the same seven batches of 20 as the 7B,
and each batch carried the 40 lines filed just before it as examples. Out of 140:

- the rules' guess: 43 right
- the 7B: 35 right, 104 wrong
- the 14B: 24 right, 84 wrong, and 32 "ask my accountant"

The bigger model was right less often. Over the rules' guess it rescued 16 lines and
broke 26.

**But it failed differently.** The 7B often wrote a sensible reason and then picked the
wrong row of the chart of accounts, such as "electricity or gas" under Wages. The 14B
never did that: all 140 of its account names matched their codes. Its wrong answers were
mostly reasonable readings that differ from how this buyer files. Software stores went to
Software when the city files them under supplies or under dues and training. When it was
unsure it said so, on 32 lines. Under the product's default the model only fills lines
that have no suggestion at all. There both models get 48 right, and the 14B makes 10
fewer wrong suggestions because it holds back instead of guessing.

It is slow. Each batch of 20 took nine to ten minutes, and it needs about 11 GB of memory.
The first try, with a bigger context and the model file memory-mapped, was killed for
running out. The test harness now saves after every batch and can resume.

**An idea from the same data, and why it is off.** The 14B's misses pointed at the
buyer's habits, not at understanding. On these 140 lines the merchant's card category
usually has a long history in the books, a median of 50 earlier lines, but no majority
account. That is why the existing category step stays quiet. The commonest account for
the category anyway was right on 52 of the 140, more than the rules or either model. That
looked like a free win, but it was measured on the very lines that suggested it. So I
built it as a layer and read it on data it was not found on:

- the whole Toronto year, first-time merchants: 74.8% right before, 75.1% after
- sixteen city divisions as their own books: 22 more right, 46 more wrong
- the Scottish Government's card lines, 2020 to 2026: 66.0% right before, 66.8% after,
  with wrong going from 30.9% to 31.9%

Mostly it turned blank lines into guesses that were wrong as often as right, or worse.
The 140 lines are the ones the rules had already given up on, so almost any guess beats
the baseline there. The layer ships switched off and stays in the code so the measurement
can be rerun.

**What it does not show.** This is one buyer for the model test, one sample of 140, and
two model sizes from one family. A hosted model such as Claude, GPT or Gemini has still not
been tried: there is no key in the build environment. The results, the commands and the
caveats are in `ventures/ai-bookkeeper/README.md`. The city's data is fetched when the
test runs and is not copied into the repository.

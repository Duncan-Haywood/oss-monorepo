---
title: "Seven out of seven was luck: a pre-registered test on a local model fails"
date: 2026-11-12
seo_title: "Pre-registering an LLM evaluation: a 14B model's 7 of 7 became 2 of 7"
tags: [sales-agent, local-models, evaluation, pre-registration]
description: A 14B local model got 7 of 7 right on a small sample. We wrote the bar down before testing it on 611 more replies, and it got 2 of 7. Nothing shipped.
---

This morning a free 14B model (Qwen2.5-14B-Instruct, on four CPU cores) looked good at one narrow job in the [sales agent](https://marisstella.app/sales-agent/). When the keyword rules couldn't tell what a reply meant and the model said "this is a plain no" or "wrong person", it was right 7 times out of 7. The 7B model it would replace was right 7 times out of 11.

That was tempting. Those replies currently wait for a person to read them. Letting the model close them would save that time. But seven is a tiny sample, and we only noticed the 7 of 7 after looking at the answers. That's how teams end up shipping noise.

So before the model saw the rest of the replies, we [wrote down the bar and merged it](https://github.com/Duncan-Haywood/oss-monorepo/pull/15142): on the other 611 labelled replies, those closes had to be right at least 85% of the time, and lose at most 2 live replies, or the feature wouldn't be built.

## What happened

The model took about three and a half hours to read the 611 replies. On the ones the rules left as unclear, it called 7 a plain no or the wrong person:

- **2 were right.**
- **4 were live replies it would have closed with nobody reading them:** "Ok.", "Noted.", "Thanks." and "ok".

A close in this agent ends the sequence with no draft and no task, so a wrong one is a lead dropped without anyone ever seeing it. Two right out of seven is 29%, far below the bar. The feature wasn't built.

It also closed objections far more readily than the 7B: "We already use Salesforce and our team won't switch", "We built something in-house for this already", "We're a nonprofit with no budget for tools like this, so it's a pass from us". Each names a reason, which a salesperson can answer. The agent keeps those as objections with a note saying the model read a no, and that rule held.

## The bigger model is not the better buy

Over all 792 labelled replies, inside the product:

| | 7B model | 14B model |
|---|---|---|
| Right, after the agent's merge rules | 735 | 732 |
| Live replies read as opt-outs (model alone) | 10 | 27 |
| Notes for you to dismiss (stop flags that were wrong) | 19 | 32 |
| Memory, time per reply | 4.7 GB, ~10 s | 9 GB, ~20 s |

The 14B reads a stranger asking "Who is this?" or "Who gave you my email?" as a request to stop, again and again. None of those act on their own (the agent turns a model's opt-out into a note for you), but each is one more thing to dismiss.

If you run the sales agent with a local model on an ordinary machine, use the 7B. The next model to try is a hosted one from a different family (that needs your own API key). Whatever the model, its stops and closes remain notes for a person, not actions.

## Why write the bar down first

Without the pre-registration, this morning's 7 of 7 would have read as a finding, and a setting would probably exist tonight. It would have quietly closed "Ok." and "Thanks." for anyone who turned it on. Writing the bar down took five minutes. Running the test took one more afternoon of a CPU nobody else was using.

The test script is `ventures/sales-agent/eval/model-closes.mjs`. Both models' answers are committed, so anyone can re-score them without running a model. Details are in the eval README, "A 14B local model on the same replies". These are agent-written test replies, not real prospects; treat the numbers as a harness measurement, not a guarantee.

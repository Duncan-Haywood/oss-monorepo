---
title: "Twice the model, mostly the same mistakes: a 14B local model reads sales replies"
date: 2026-11-12
seo_title: "Qwen2.5 14B vs 7B for sorting cold email replies on a CPU"
tags: [sales-agent, local-models, evaluation, llama-cpp]
description: A free 14B model on four CPU cores reads sales replies slightly better than a 7B, still reads live leads as opt-outs, and is no better as a second reader.
---

Earlier today the [sales agent](https://marisstella.app/sales-agent/) measured a free 7B model (Qwen2.5-7B-Instruct) sorting replies to outreach. It read unfamiliar replies far better than keyword rules, but it read live leads as opt-outs, so every stop it suggests now goes to a person instead of acting on its own. The obvious next question was whether a bigger free model fixes that. This run tried Qwen2.5-14B-Instruct, the next size up in the same family: 9 GB, running on llama.cpp on four CPU cores with no GPU, about 21 seconds a reply.

## Setup note: turn mmap off

On this CPU, llama.cpp repacks the weights for Intel's AMX matrix instructions. With the default memory-mapped load, the repacked copy sits beside the mapped file, and at about 15 GB the kernel killed the server. With `--use_mmap false` the weights load once and the server sits at 10 GB. If a 14B model dies while loading on a 16 GB machine, try that first.

## A bit better alone, no better in the product

We ran 181 replies first: the two sets neither the rules nor any model was tuned on, plus five sets written to bait false stops.

| Same 181 replies | Rules | 7B alone | 14B alone | 7B in the product | 14B in the product |
|---|---|---|---|---|---|
| Right | 133 | 136 | 144 | 147 | 146 |
| Live leads read as opt-outs | 0 | 6 | 9 | 0 | 0 |

Alone, the 14B gets 8 more right than the 7B. Inside the product, where its answers pass through the merge rules, it gets one fewer. And it reads more live leads as opt-outs, not fewer. "Who gave you my email?", "Do you handle unsubscribe links and suppression lists for us?" and "Our legal team asks: are you CAN-SPAM compliant?" all came back as requests to stop. "Can you resend the attachment? It didn't open" came back as a bounce, the same mistake the 7B made. Model size didn't fix the error we care about most, so a model's opt-out stays a note for a person, whichever model you run.

## The one thing it might do well

The agent has a second kind of "stop": a plain no ("We have decided not to proceed") or a wrong person ("You've got the wrong Sam, I work in finance"). These end the cadence with no draft and no task. If the label is wrong, nobody ever reads that reply. So when the rules aren't sure and the model says "no", the agent currently holds the reply for a person.

On the 181 replies, the 14B called a plain no or the wrong person on 7 replies the rules couldn't place, and all 7 were right. The 7B was right on 7 of 11. Seven is a small number, and we chose the question after seeing the answers, so it proves nothing on its own. We wrote down the test before the model saw the other 611 replies and merged it first: the 14B's closes on unclear replies may act alone, as an opt-in setting, only if they are right at least 85% of the time there and lose no more than 2 live replies. That run is going now.

## It still isn't an independent second reader

The project's checks on real mail (the Enron corpus) rest on labels from two agent readers of the same model family. A reader from another family would be a stronger check. We already knew a 7-8B model wasn't one: it sides with the rules on the same surface cues the rules fall for. The 14B was the hoped-for upgrade:

- Agreement with the two agent readers: 70% and 75% (kappa 0.56 and 0.64). The agent readers agree with each other 81% of the time (0.71).
- On 53 stops both agent readers call wrong, the 14B still calls 15 of them a stop. The 7B called 13.
- The 14B agrees with its own 7B as well as the two agent readers agree with each other.

Doubling the size moved agreement by four points and did nothing about the lean. A second reader that shares the rules' blind spots makes the rules look better than they are, so the gap is still open. It needs a person, or a strong model from another family.

## What this means if you run it

- A free 14B model is not worth the 9 GB over a 7B for sorting replies through this agent: the product scores the same with either.
- Whatever model you use, its opt-outs and bounces stay notes for you, not actions.
- If the pre-registered test passes, there will be a setting that lets a model close a reply the rules couldn't read. It will be off by default, because your model may be smaller.

Everything here is in `ventures/sales-agent/eval/README.md` ("A 14B local model on the same replies"), with the model's answers committed so anyone can re-score them offline. Estimates from a test harness, not advice; the replies are agent-written test sets, not real prospects.

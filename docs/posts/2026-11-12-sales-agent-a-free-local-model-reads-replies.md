---
title: "A free 7B model reads sales replies better than our rules, and still can't be trusted with a stop"
date: 2026-11-12
seo_title: "Can a local LLM sort cold email replies? Qwen2.5 7B on 792 replies"
tags: [sales-agent, local-models, evaluation, llama-cpp]
description: A free local 7B model reads unfamiliar sales replies far better than keyword rules, but mistakes live leads for opt-outs. How the agent now uses it.
---

The [sales agent](https://marisstella.app/sales-agent/) sorts replies to your outreach (opt-out, bounce, away, not now, no, objection, question, interested) with keyword rules, and can also ask an AI model on your own key. Until today nobody had measured the model path. This run measured it with a model that costs nothing per call: Qwen2.5-7B-Instruct, 4.7 GB, running on llama.cpp on four CPU cores with no GPU, about ten seconds a reply.

It read all 792 labelled replies the project has, with the product's own prompt. All of them were written by agents to test the rules, and the rules were tuned on most of them. The model was tuned on none.

## The model reads better than the rules did

The fair comparison is the model against the rules *before* each set was tuned on: the rules as they stood the day the set was written. On 672 fresh replies:

- the rules before tuning: **464 right (69%)**
- the model, never tuned: **578 right (86%)**
- the rules today, after being patched on these same replies: 606 (90%)

On the two sets neither was ever tuned on, the model got 70 of 81 right and the rules 49. It caught every opt-out in them, including "pls remove from ur list" and "If I get one more of these I'm reporting it as spam", which the rules still miss.

## It is wrong in the expensive direction

Wrong answers differ in cost. If the agent reads a "please stop" as unclear, a person reads it. That costs a minute. If it reads "Call me later today, around 3pm" as *not now*, it pauses a hot lead. If it reads a question as an opt-out, the person goes on the suppression list for good.

The model makes the expensive mistakes. Across the 792 replies it read 66 live replies as some kind of stop (the rules: 19) and 10 as opt-outs (the rules: 2). Some examples:

- "Do you handle unsubscribe links and suppression lists for us?" read as an opt-out
- "Can you resend the attachment? It didn't open" read as a bounce
- "Now is actually a perfect time, we just lost our SDR. Can you do Wednesday at 10?" read as not now
- four out-of-office auto-replies read as *not now*, which would draft a reply to a robot

The agent's merge rule let all of these through. The rule was "the model may only lower how much contact follows", and every one of these lowers contact. Merged that way, the agent scored 687 of 792, worse than the rules alone, with 12 live leads suppressed.

## What changed

Three limits on the model, all now in `mergeTriage`:

1. **A model's opt-out or bounce becomes a task, never an action by itself.** The lead stays paused, and you get a note: "The model reads this reply as a request to stop; the rules did not. If they asked to stop, add them to your suppression list." Nothing goes out without your approval either way.
2. **A model may not move a reply the rules read as interested.** Lower contact is not always safer. A paused hot lead is a lost one.
3. **A model may not turn a no-draft category into a drafting one at the same rank.** The code's own comment already said this. The rank check let *out of office* to *not now* through.

Merged under these limits: 728 of 792 right, 2 false opt-outs (both the rules' own), and the 4 opt-outs only the model caught arrive as flagged tasks.

We chose these limits after seeing the answers, so 728 is a tuned figure, not a forecast. Limit 1 costs something: those 4 real opt-outs now wait for a person instead of going straight to the suppression list. The lead is paused meanwhile and nothing is sent, so the wait costs time, not a second unwanted email.

## Two smaller finds

- One label in the test sets was `wrong_person`, which is not a category, so that reply could never score right. It is now `left_company`, and a test checks every label.
- The model misspells its own labels about 1 time in 90 ("unsubscribed", "uninterested"). Those answers used to be thrown away. They are now mapped.

## What it means if you use it

A free local model is worth running beside the rules. Point the agent at Ollama, LM Studio or llama.cpp and it reads the replies the rules can't. Its stop readings are mostly noise (4 of 23 right here), so it only flags them. Next: the same 792 replies through a 14B model and a hosted one. The answers are cached by hash in the repository, so every future change to the merge can be re-scored without calling a model again.

Commands, the per-set table and every example are in `ventures/sales-agent/eval/README.md`, "A free local model on every reply set".

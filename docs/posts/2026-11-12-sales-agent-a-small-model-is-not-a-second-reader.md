---
title: "We asked a free local model to check our sales agent's grading. It graded like the rules did."
seo_title: "Can a local LLM be a second annotator? Llama 3.1 8B on real replies"
date: 2026-11-12
tags: [sales-agent, evaluation, local-models]
description: "Llama 3.1 8B, run locally with no key, labelled 298 real Enron replies. It agreed with our agent readers less than they agree, and leaned toward the rules."
---

[Sales Agent](https://marisstella.app/sales-agent/) reads the replies your outreach gets back. The costly mistake is a wrong *stop*: filing a person's reply as "unsubscribe", "not interested" or "left the company" and quietly ending the sequence. To measure that, we run the rules on real people's mail (the public Enron corpus) and have a separate agent label every stop blind, from a written brief ([`READER.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/sales-agent/eval/enron-labels/READER.md)).

Every one of those readers came from the same model family. Two of them, labelling the same 107 stops apart, agreed on 81% (Cohen's kappa 0.71). That gap moved the score by about as much as a whole round of rule changes. So the obvious next step was a reader from a different family, and the cheapest one is a model you can run yourself.

## The setup

`eval/model-reader.mjs` hands the brief to any OpenAI-compatible server as the system prompt, then shows it one reply at a time at temperature 0. It never sees the rules' answers or the other readers' labels. We used Meta's Llama 3.1 8B Instruct (a 4.9 GB quantised file) on four CPU cores with llama.cpp. That came to 10 to 15 seconds a reply, no API key and no bill. It labelled all 298 stops across the three most recent halves of the corpus.

## What it found

| Same stops | Exact agreement | Kappa |
|---|---|---|
| Agent reader vs agent reader (107) | 81% | 0.71 |
| Agent reader vs Llama 8B, three halves | 54%, 63%, 76% | 0.39 to 0.68 |

That alone would only say the small model is noisier. What decides it is the direction of the disagreement. The agent reader called 160 of the stops `none`: the reply wasn't a decline, an opt-out or a departure at all. Llama sided with the rules on 74 of those. Its commonest disagreement was a "no" in passing, someone else's "no" or reported speech, read as a decline. Those are the phrasings the rules spent six rounds learning to ignore.

To check it wasn't just Llama, we ran Alibaba's Qwen2.5 7B on the same 107 stops from one half. It did better: 66% and 74% agreement with the two agent readers. But it still fell short of their 81%, and it still sided with the rules on 25 of the 68 stops the first agent reader called `none` (Llama: 36). Two small models from two families lean the same way.

A checker that makes the same mistakes as the thing it checks will make it look better than it is. So we keep the agent-reader figures as the reference, and the small model doesn't get a vote.

## Where it did help

When readers from two different families both say a stop is wrong, it almost certainly is. On the newest half, they agreed on 43 of 56 stops: 31 right, 12 wrong. The 12 are plain mistakes: "I am not interested in climbing a mountain", "good teams don't need to change their uniforms", "these dates don't work for him". The last one became a rule fix. A date that "doesn't work for" anyone is about scheduling, not someone leaving the company. On all 76,565 real replies in the eight halves, the fix removes exactly the two copies of that message and nothing else.

## What's next

A reader from another family still has to be a strong one: a person working from the brief, or a larger model. The script runs either. Point `LLM_BASE_URL` at any compatible endpoint. The labels are in the repository as Message-IDs and categories only. No corpus text is committed. Full numbers are in [eval/README.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/sales-agent/eval/README.md), "A third reader from another model family".

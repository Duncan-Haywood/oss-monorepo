---
title: "A Draft Patch That Broke an Older Reply Set: the sales agent's fourteenth test"
seo_title: "Testing an AI Sales Reply Classifier on Finnish, Turkish and German Opt-Outs"
date: 2026-11-08
tags: [sales-agent, evaluation, cold-email]
description: "Fourteenth fresh set of 31 sales replies: 26 right before any change, 31 after. One draft patch cost an older set a point, which is why old sets stay in the loop."
---

The [sales agent](/ventures/sales-agent/) reads replies to cold outreach and sorts them: opt-out, not interested, not now, out of office, wrong person, question, interested. A person approves anything it sends. Each round, a new set of replies is written, scored once before any change, and only then used to patch the rules.

The fourteenth set has 31 replies. It was scored at 26 right, with one overreach and one missed opt-out, a Turkish "please remove me from your mailing list". Finnish and Czech opt-outs were caught. Missed or misread were "not something we'd ever buy", "send over a short deck" and "we've been looking for something like this", which the rules took for a question.

One draft patch matched "send over a one-pager" as well as "deck". That moved a question into "interested" and dropped an older set from 37 to 36. Narrowing it to "deck" fixed that. Final: 31 of 31 here, no older set lower than before.

One label changed: a nonprofit saying it has "no budget" is a price objection, not a decline.

The labels were written by the same agent that patched the rules, so 31 of 31 is a regression floor, not a forecast. Real replies from a real campaign are still the open item. Numbers and the set are in `ventures/sales-agent/eval/`.

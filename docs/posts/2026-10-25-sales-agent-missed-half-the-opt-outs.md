---
title: "Our sales-reply agent missed half the opt-outs on a fresh test set"
date: 2026-10-25
description: "A new 42-reply set aimed at unsubscribe wording caught only 9 of 18 opt-outs. What was missed, what changed, and why the fixed number is not an accuracy figure."
tags: [ventures, sales-agent, evaluation, compliance]
---

[Sales Agent](../../ventures/sales-agent/README.md) reads replies to cold
outreach and decides what each means. The category that matters most is
"unsubscribe": a missed one means a person who asked to stop stays in a
cadence, which is the legal-risk direction (CAN-SPAM, PECR, CASL).

We wrote a fourth test set of 42 replies, 18 of them opt-outs in messy
human wording, and scored it once before touching any rule.

| | Before | After |
|---|---|---|
| Replies read right | 25 of 42 | 34 of 42 |
| Opt-outs caught | 9 of 18 | 18 of 18 |
| Wrong actions | 0 | 0 |

Missed: "please stop", "Leave me alone", "Strike me from your lists",
"I never gave you permission. Don't write again.", "unsub", "take it off
whatever list you bought", and French, German and Spanish "I no longer wish
to receive your messages". Nothing was ever acted on wrongly: the misses went
to a person as "unclear", paused. But they were not added to the suppression
file automatically.

The caveats are the finding. The set was written by an agent that had read
the rule list, and the patterns were then added looking at these same
misses, so 18 of 18 is a tuned number, not accuracy on real inboxes. The
patch also moved an older untouched set from 16 to 17 right and broke
nothing. The other eight misses ("Pass.", "We tried something like this
before") remain: the rules hand those to a person, by design.

Files: `ventures/sales-agent/eval/fresh-2026-10-25.jsonl`, scored with
`node eval/run.mjs`.

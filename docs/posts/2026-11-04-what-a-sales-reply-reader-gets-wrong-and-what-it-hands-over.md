---
title: "What a sales reply reader gets wrong, and what it hands to a person"
date: 2026-11-04
description: "We wrote 30 new cold-email replies after the rules were frozen and scored them once: 23 right, none wrongly acted on, no opt-out missed."
tags: [sales-agent, evaluation]
---

# What a sales reply reader gets wrong, and what it hands to a person

The Sales Agent reads replies to cold email and sorts them: interested, a
question, not now, not interested, an objection, wrong person, out of office,
or stop. The rule that matters most is that it only acts on its own when that
means *less* contact. Anything that would send a message waits for a person.

To test it we wrote 30 new replies after the rules were frozen and scored them
once. Every reply is written by an agent, not taken from a real inbox, so read
the numbers as a floor for how the rules behave, not a forecast for your mail.

- **23 of 30 right** on the first scoring.
- **0 replies** where the rules chose a category that sends more contact than
  the truth. **0 opt-outs missed.**
- The seven misses were all *handed to a person* ("unclear") or filed under a
  neighbouring category. Examples: "Not a priority this half. Please check in
  again in six months." and "Our drivers won't adopt another app, we tried that
  last year and it failed."

We then added six phrasings and rescored: **28 of 30**. That second number is on
a set we tuned on, so it is a regression test, not evidence.

Two misses stay on purpose. "Looping in my colleague Priya who owns this. Priya,
can you take a look and set up a call?" reads as a handover, so a person decides.
"Who is this and how did you get my email?" is a data-source question that
deserves a human answer.

Code and set: `ventures/sales-agent/` (`eval/fresh-2026-11-04b.jsonl`).
Still missing: replies from real people, which is the first item in the venture's
list of next steps.

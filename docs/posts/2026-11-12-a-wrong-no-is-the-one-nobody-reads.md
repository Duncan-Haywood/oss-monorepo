---
title: "A wrong no is the one nobody reads: sorting an AI model's mistakes by what they cost"
seo_title: "AI reply triage errors, ranked by what a salesperson would see"
date: 2026-11-12
tags: [sales-agent, ventures, ai]
description: "A local 7B model's 37 false stops in our sales agent, sorted by what each category does. 16 were leads closed unread; now 3."
---

The [sales agent](https://marisstella.app/sales-agent/) sorts replies to outreach into categories: interested, a question, an objection, not now, not interested, wrong person, away, an opt-out, a bounce, or unclear. Keyword rules do the sorting. An AI model can join in, on your own key or a free local server, under a merge that only lets it lower how much contact follows.

Earlier today a free local model (Qwen2.5 7B on a CPU) read all 792 of our labelled replies. Merged with the rules, it got 728 right, but 37 replies came out as *less contact than they asked for*. That was the open question: do those 37 cost anything a person would notice?

## Rank was the wrong measure

The 37 counted any move down the contact ladder. But the agent doesn't act on a rank. It acts on a category, and the categories do quite different things:

- **Not interested** and **wrong person** end the cadence. No draft, no task. If a live reply lands there, nobody reads it.
- **Unclear, question, objection, not now** and **interested** all put the reply in front of a person, as a task, a draft to approve, or both. If the label is wrong, the person sees it when they read the draft.
- **Question** and **objection** differ in one way: a question gets an "answer their question" task and a draft that answers it, and an objection gets a rebuttal.

Sorted that way, the 37 split into two kinds. Sixteen replies were **closed and never read**, and the model closed 14 of them: "ok", "Noted.", "Lol. Maybe. Sure, whatever, call my assistant.", "Our team is pretty attached to the spreadsheet we've used for years", "We already have Salesforce and it does everything we need." The other 11 were **questions answered as objections**: "What does it cost for a team of 12?", "Does this work with Xero or only QuickBooks?", "Is it GDPR compliant and where are your servers?" A person would have spotted those, but only after reading a rebuttal to a price question.

When the model closed a reply that a person would otherwise have read, it was right 11 times out of 25. A coin flip shouldn't get to end a lead.

## Two changes

1. A model's "not interested" or "wrong person" on a reply the rules read as unclear, a question or an objection is now a **flag**, the same way its opt-outs already were. The rules' answer stands. On an unclear reply, the model's reading becomes the line the person sees: *"The rules could not read this reply. The model reads it as not interested. Check it before you act."*
2. A model may not turn a question the rules found into an objection.

## What it bought, and what it cost

| | Right of 792 | Closed unread | Right of the 81 never tuned on |
|---|---|---|---|
| Merge before | 728 | 16 | 68 |
| Merge now | 735 | 3 | 62 |
| Rules alone | 726 | 3 | 49 |

The 3 that are still closed unread are the rules' own. The model no longer closes anything silently.

The honest cost is in the last column. On the two sets nobody tuned anything on, the score fell from 68 to 62. Six replies there were real no's ("We have decided not to proceed. All the best.", "Our COO, Priya, handles all vendor choices"). The model had closed them correctly, and now they wait for a person. That cost is a few seconds of reading per reply, with the model's verdict already written beside it. Before, the cost was a live lead nobody ever saw. For a tool whose job is not losing leads, we think that's the right trade. We chose both changes after seeing these answers, so the 735 is a tuned figure. The 62 is not tuned.

## What we couldn't do today

The plan was a bigger model, a 14B, to see whether its "no" is good enough to act on alone. Every model host we tried refused the connection from this session: Hugging Face, the Ollama registry and ModelScope. So everything above was re-scored offline from the 7B's saved answers (`node eval/model.mjs ... --offline --cache eval/model-answers/qwen2.5-7b-q4km.json`), which takes a second. The 14B is still the next step. Now there's a sharper question for it: are its closes right more often than 11 times in 25?

The tables and commands are in `ventures/sales-agent/eval/README.md`, under "The 37 false stops, by what a person would see".

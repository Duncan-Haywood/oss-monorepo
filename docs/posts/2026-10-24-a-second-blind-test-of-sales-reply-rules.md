---
title: "A second blind test of an AI sales agent's reply rules: 27 of 41"
date: 2026-10-24
description: "Keyword rules for sorting sales replies scored 15 of 40 on unseen text, then 27 of 41 on a second unseen set. What the two numbers do and don't say."
tags: [ai-agents, sales, evaluation, open-source]
---

# A second blind test of an AI sales agent's reply rules: 27 of 41

The Sales Agent in this repository reads replies to cold outreach and sorts them:
unsubscribe, bounce, out of office, not now, objection, question, interested, or
"unclear, read it yourself". Anything that reduces contact (stop, pause, suppress)
happens automatically; anything that sends a message waits for a person.

Its first blind test, on 40 replies written after the rules were tuned, scored 15
right. Rules tuned until they got 120 replies perfect had learned those 120
replies, not the task. This week a second set of 41, written without looking at
what the rules do with them, went through once:

| | First blind set | Second blind set |
|---|---|---|
| Replies | 40 | 41 |
| Read right | 15 | 27 (66%) |
| Rules named a category | 22, right on 15 | 31, right on 24 (77%) |
| Unsubscribes caught | 1 of 5 | 5 of 7 |
| Drafts where the truth contacts less | 1 | 0 |

The second set looks better. It is not evidence the rules improved: nothing
changed in them between the two, so the gap is mostly the writer. The second set
had plainer unsubscribes ("Stop. Do not contact me again.") and fewer oblique
ones. It also missed in ways the first did not: "pls remove from ur list" and
"If I get one more of these I'm reporting it as spam" both went to a person as
unclear instead of onto the suppression list. They were paused, not emailed, so the
safety rule held, but the opt-out was not recorded.

The pattern across both sets is the useful part. Keyword rules are cautious, so
they rarely send the wrong draft, but they handle objections badly ("we already pay
for QuickBooks" and "how much is it? the last vendor was too steep" read as a plain
question or not at all) and they take a meeting request phrased as a question
("Can you do Thursday at 2pm?") for a question.

Both sets were written by AI agents, so neither is a real inbox. What would settle
it is a set labelled by a person, and a model on a real key scoring both files. The
repository ships the harness (`ventures/sales-agent/eval/model.mjs`); this
environment has no key. The rules are not retuned on the new set: it is pinned in a
test so a later change shows up.

Code and sets: `ventures/sales-agent/eval/`.

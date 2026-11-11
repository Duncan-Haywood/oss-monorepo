---
title: "When the held-out half says stop: a rule round that halved errors and changed nothing"
seo_title: "Why a classifier fix that worked on tuning data failed on unread mail"
date: 2026-11-11
tags: [sales-agent, evaluation, real-data]
description: "Round seven halved wrong stops on its tuning half, then moved one stop in 90 on unread Enron mail: 4.0 to 3.9 per 1,000. Why, and what comes next."
---

[Sales Agent](https://marisstella.app/sales-agent/) reads the replies your outreach gets back and files the ones that mean stop: unsubscribe, not interested, out of office, left the company. A wrong stop drops a live lead without anyone looking. So each round we tune the rules on parts of the public Enron email corpus we've already read. Then we freeze them and score them once on a part nobody has opened, with a separate agent labelling every stop blind.

Round seven went by the book. Before any rule changed, the old rules' stops on the eighth half (9,428 real replies) were saved to a file nobody read. Then came about thirty narrow fixes, each quoting the real sentence that went wrong. Some examples:

- "I am traveling wednesday but reachable **through** my assistant" was read as a dated absence, because "through" counted as "through Friday".
- "I'll take my **ring** off my finger" was read as "take me off your list".
- "these new dates don't work for me" was read as "I don't work for that company".
- "Please cancel the Palm.Net service ... I do not need it": a real decline that earlier rounds missed.

On the half the fixes came from, wrong stops fell from 41 to 17, with no right stop lost. Then the rules were frozen and the unread half was labelled.

| Unread half, 9,428 replies | Round 6 rules | Round 7 rules |
|---|---|---|
| Right / wrong / ambiguous | 49 / 38 / 3 | 49 / 37 / 3 |
| Wrong stops per 1,000 replies | 4.0 | 3.9 |

One stop out of 90 changed. That's no gain: two blind readers of the same text differ by about 1 per 1,000.

## Why the gain didn't carry

**The halves share text.** The corpus files the same message under several IDs. 43 of the 88 stops on the half we tuned on had the same text as a stop on an earlier half, and so did 49 of the 90 on the unread one. So some of every round's tuning gain comes from fixing a copy of a message already fixed. That moves the tuning numbers but does nothing for new mail. Earlier rounds' tuning-half gains were probably inflated the same way; we haven't measured them. Their fresh-half scores are still fair comparisons, because the same copies sit in the "before" and "after" columns.

**What's left is a policy question.** 20 of the 37 wrong stops left are the writer's own absence in a working reply, like this one from the tuning half: "I am out of the office until next Thursday and can't give you the detail now. However, ...". The reader says that's a person writing. The product pauses the lead because a date is stated. Another veto won't settle that. It needs a decision.

## What it does show

The unread half gives round six its first honest reading on new text: 4.0 wrong stops per 1,000, close to the 4.3 it scored on its own fresh half. So the rules sit at about 4 wrong stops per 1,000 real replies, about 55% precision on stops. Opt-out recall (115 of 119 real "take me off this list" messages), auto-reply and bounce catch rates, and every agent-written test reply came out the same.

The useful next steps aren't more rules. They are: decide the away policy on purpose; get a second reader from outside this model family, or a person; drop duplicate texts before any future round; and above all, test on real replies to real outreach. To make that second reader possible, the brief our blind readers got is now a file, `ventures/sales-agent/eval/enron-labels/READER.md`.

Method, labels (Message-IDs only) and every table: `ventures/sales-agent/eval/README.md`, "Seventh round".

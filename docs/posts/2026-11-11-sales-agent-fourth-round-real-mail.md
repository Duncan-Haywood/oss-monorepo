---
title: "\"I'm out Friday\" is not an away notice: a fourth round on real mail"
seo_title: "Cutting false stops in an email reply classifier, scored on unread mail"
date: 2026-11-11
tags: [sales-agent, evaluation]
description: "A fourth round of reply-rule fixes for the sales agent, tuned on four halves of the Enron corpus and scored once on a fifth that nobody had read: wrong stops fell from 7.2 to 5.0 per 1,000 replies, at a cost of one right stop."
---

[Sales Agent](https://marisstella.app/sales-agent/) reads the replies your cold outreach gets back. When a reply says stop (unsubscribe, not interested, out of office, left the company, bounced), the lead gets suppressed, paused or marked gone. A stop that fires by mistake loses a lead without anyone noticing. So for the last few runs we've tested the rules on real people's writing: the Enron email corpus, which is public and CC0, split into halves by file hash.

Each round follows the same method. We change the rules looking only at halves we've already read. Then we run them once on a half nobody has opened, and a separate agent labels every stop it finds without seeing what the engine said. This run was round four. It tuned on halves `0*` to `3*` and scored on `4*`: 9,589 real replies, never opened before today.

## What changed

- **Whose absence it is.** The engine now finds the nearest subject before an away phrase. If that subject isn't the writer, the reply isn't an away notice. For example: "Craver, Edison's CEO, is traveling and won't be back in the office until Wednesday", "the person she needs to talk to is out of the office", "Somehow her Out of Office notification stopped working". The last round's pattern only caught a name or pronoun immediately before the verb.
- **Here the rest of the week.** "I will be out of the office on Friday, but will be in all next week" is no longer read as an away notice.
- **A bare "No." that goes on talking.** "No. I don't think I know him." and "No - they pay you just for being you!" answer a question. A "No." now counts as a decline only when the rest of the reply is empty, a sign-off, or also declines. "No. 5 -- add that..." is a numbered list, and the sentence splitter now keeps it together.
- About twenty narrower fixes, each with the real sentence quoted in a comment. Examples: "We're all fine, but very busy!!!", "We are set for closing at 10:00 AM", "the TW Unsubscribed Capacity page", "a confidentiality provision that goes to internal communication", "Turns out I was just asking the wrong person".

## The score

| On the unread `4*` half (9,589 replies) | Round-3 rules | Round-4 rules |
|---|---|---|
| Stops: right / wrong | 65 / 69 | 64 / 48 |
| Precision | 49% | 57% |
| **Wrong stops per 1,000 replies** | **7.2** | **5.0** |

The one right stop we lost was a real handover: "Carol is the attorney working on this now that Janice has left." The new "now that X has left" exception sends it to a person. Opt-out recall on the labelled real opt-outs held at 37 of 38. Real auto-replies (45 of 45 on `4*`) and real bounces were caught at the same rate as before. All 379 unit and agent-written-set tests pass.

On the halves the rules were written from, wrong stops fell by half (145 to 73). On new text they fell by 30%. Those tuning halves also lost 21 right stops. Each one was a "No." followed by an answer, which round one's labels judged sentence by sentence. That gap is the reason we keep an unread half for every round.

## What this doesn't show

Enron mail is internal business mail, not replies to sales outreach. It measures how often a stop fires on writing that asks for nothing of the kind. It doesn't measure how well the rules sort a sales inbox. The reader was another agent from the same model family, not a person. Some of its calls are arguable: it labelled three "No." replies `none` because the rest of each reply answered something else.

There's also a fault this round's scoring found but didn't fix. The rule that decides when "No." still stands counts any "need", "thanks" or "n't" in the rest of the reply as a decline. That's too broad, and those three replies stayed stops because of it. Fixing it now would mean tuning on `4*`, so it waits for round five, which will be scored on a sixth half. Two veto patterns were also case-sensitive by mistake. We fixed them after the score was written down, and they change nothing on `4*`.

The full method, labels (Message-IDs only, no text) and every table are in `ventures/sales-agent/eval/README.md`, "Fourth round".

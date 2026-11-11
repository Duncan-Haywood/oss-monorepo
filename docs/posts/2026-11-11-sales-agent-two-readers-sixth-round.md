---
title: "Two blind readers, one inbox: how much of a classifier's score is the grader"
seo_title: "Inter-reader agreement on a reply classifier's false stops"
date: 2026-11-11
tags: [sales-agent, evaluation]
description: "Two blind readers agreed on 81% of 107 real replies, and the reader moved the score as much as a round of fixes. Round six: 5.6 to 4.3 wrong stops per 1,000."
---

[Sales Agent](https://marisstella.app/sales-agent/) reads the replies your outreach gets back. If a reply says stop (unsubscribe, not interested, out of office, left the company), the lead is suppressed, paused or marked gone. Each round we tune the rules on parts of the public Enron email corpus we've already read. Then we score them once on a part nobody has opened, and a separate agent labels every stop without seeing what the engine said.

Today two scheduled sessions did round five at the same time, without knowing about each other. Each wrote its own fixes from the same text and froze them before opening the test half. Each had its own reader label that half blind. One version landed first. By accident, the other became the experiment this method was missing: two independent readers labelling the same 107 messages.

## How much the readers agree

The two readers agreed on 81% of the messages (87 of 107). On the coarser question, stop or not, they agreed on 89. Most of the disagreements were the same kind of reply: a person saying, partway through a working email, that they'll be out of the office. One reader called that an away notice. The other called it ordinary work talk.

| Wrong stops per 1,000 replies on the same half | Reader A | Reader B |
|---|---|---|
| Last round's rules | 7.2 | 5.8 |
| Round five (landed) | 5.5 | 4.2 |
| Round five (the other session's) | 4.7 | 3.7 |

The good news: both readers ranked the three rule sets in the same order. The bad news: switching reader moved every number by 1.0 to 1.4 per 1,000. That's as large as a whole round of fixes. So a single reader can tell you which rule set is better, but a per-1,000 figure carries a reader effect about that big. From now on we compare rounds only under one reader's instructions, and we treat a change under about 1 per 1,000 as noise. Both readers come from the same model family, too, so a human reader is still the most useful missing piece.

## Round six

Round six takes the version that landed, adds what the other session's version did better, and adds three fixes from the half both versions had been scored on. It catches an absence mentioned deep in a long reply ("... I'll let you know who will attend. I will be out of the office that day."). It handles "don't need" about something we don't sell ("I don't need this spreadsheet everyday"), and it stops counting handovers someone else did ("Mr. Lay had passed this on to Joe"). The three fixes restore real declines both round fives had lost: "No. I'll let this one go", "No. I will not agree to any penalty charges" and "I do not need a regulatory lawyer at this time".

Then we froze it and scored it once on a seventh half: 9,592 real replies nobody had opened.

| On the unread `6*` half | Round five | Round six |
|---|---|---|
| Stops: right / wrong | 45 / 54 | 45 / 41 |
| **Wrong stops per 1,000 replies** | **5.6** | **4.3** |

No right stop was lost. Real auto-replies (315 of 320) and bounces (304 of 315) are caught across all seven halves, the same as before. Opt-out recall on the labelled real opt-outs held at 37 of 38.

## What it doesn't show

Enron is internal business mail, not replies to sales outreach. It measures how often a stop fires on writing that asks for nothing of the kind. It doesn't measure how well the rules sort a sales inbox. One real decline is still missed: "Please cancel the Palm.Net service ... do not need the Palm.Net service." Round five reads a request beside a soft "no" as scoping work. That's on the list for round seven.

The method, both readers' labels (Message-IDs only) and every table are in `ventures/sales-agent/eval/README.md`, under "Sixth round".

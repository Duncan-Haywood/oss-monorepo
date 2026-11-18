---
title: "The third round of fixes cut 52% of wrong stops on mail we'd read, and 23% on mail we hadn't"
seo_title: "Email reply triage: third-round rule fixes on an unread Enron half"
date: 2026-11-11
tags: [sales-agent, evaluation]
description: "Third-round fixes to the sales agent's reply rules, scored once on 9,656 unread Enron replies: wrong stops 10.9 to 8.4 per 1,000, right stops 47 to 46."
---

[Sales Agent](https://marisstella.app/sales-agent/) sorts the replies your outreach gets back. The mistake that costs most is a wrong *stop*. That means filing a reply as an unsubscribe, a "not interested", an away notice or "left the company" when the writer said nothing like it. A live lead then gets suppressed or paused.

Each round of fixes is tested the same way, on real people's mail from the public Enron corpus. The rules are written from sample halves that have already been read. Then they are scored once on a half nobody has opened, and a separate agent labels that half without seeing what the engine said. This run did the third round. It tuned on three halves (`0*`, `1*`, `2*`) and scored on a fourth (`3*`, 9,656 replies).

## What was still wrong, and why

Most of what was left came from a few patterns:

- **Subject lines.** The engine read a reply's subject as if the writer had typed it. But "Re: TW Unsubscribed Capacity" or "Re: Louise Kitchen - out of office" is the thread's subject. In a sales inbox that's usually the subject *we* wrote. A `Re:` subject is no longer read for stops. Auto-replies use their own subjects ("Out of Office: ..."), so they still count.
- **Someone else is away.** "Mike is out of the office this week, but I'll follow up with his reports" isn't an away notice from the writer. A named person, or he, she, they or both, before "is out", "will be back" or "is travelling" no longer pauses the lead. If this rule misfires, a person reads the reply. That costs less than a wrong pause.
- **Forwarding and scheduling.** "I will pass this information along" was read as "I'll pass" (no thanks). "Saturday doesn't work for me" was read as "doesn't work for" (has left). "Would you please contact Patti" was read as a referral away from the writer.

## The numbers

| On the unread half (9,656 replies) | Before | After |
|---|---|---|
| Wrong stops | 105 | 81 |
| Wrong stops per 1,000 replies | 10.9 | 8.4 |
| Right stops | 47 | 46 |
| Real auto-replies caught (all four halves) | 183 of 186 | 183 of 186 |

On the halves the rules were written from, wrong stops fell from 133 to 64, a 52% cut. On new text they fell from 105 to 81, a 23% cut. Last round, about half of each fix carried over to new text. This round, less did. The broad patterns are fixed now, and what's left is spread across many small ones.

## One labelling choice to know about

Round 2's reader labelled a bare "No." as no stop, since in internal mail it answers some other question. This round's reader was told to label it a decline, as round 1 did. That's what "No." means as a reply to outreach. On round 2's half, that choice accounts for 14 of its 88 "wrong" stops. Both columns of the table above use the same reader, so the before-and-after comparison holds.

## What's left

Most of the 81 are first-person short absences in ordinary work mail ("I'll be out Friday, but in all next week"). The rest are "don't need the X" in work talk. The short absences are the hard part. A real prospect who writes "I'm out Friday" is close to sending an away notice, and pausing a lead for a day costs little. A fifth half (`4*`) is still unread for the next round. The labels hold only message IDs and categories, no text: `ventures/sales-agent/eval/README.md`, "Third round".

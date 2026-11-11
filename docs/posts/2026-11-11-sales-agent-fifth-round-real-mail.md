---
title: "\"No. I need to know how many beds\" is not a decline: a fifth round on real mail"
seo_title: "Reply classifier false stops, round five, scored on an unread half"
date: 2026-11-11
tags: [sales-agent, evaluation]
description: "Fifth round of sales-agent reply fixes, scored once on an unread Enron half: wrong stops 7.2 to 5.5 per 1,000 replies, one right stop lost."
---

[Sales Agent](https://marisstella.app/sales-agent/) reads the replies your outreach gets back. When a reply says stop (unsubscribe, not interested, out of office, left the company, bounced), the lead is suppressed, paused or marked gone. A stop that fires by mistake loses a lead quietly. So we test the rules on real people's writing: the public, CC0 Enron email corpus, split into halves by file hash.

The method hasn't changed. We tune only on halves we've already read, then freeze the rules and run them once on a half nobody has opened. A separate agent labels every stop without seeing what the engine said. This was round five. It tuned on halves `0*` to `4*` and scored on `5*`: 9,538 real replies. Before we changed a single rule, the round-4 stops on `5*` were saved to a file unread.

## What changed

- **The "No." check that round four left too loose.** Last time we found that a "No." still counted as a decline whenever the rest of the reply contained "need", "thanks" or "n't". That kept "NO. I need to know how many beds there are total" and "no - I never heard back" as declines. The rest of the reply now has to decline in words that mean it ("not interested", "no thanks", "we're all set", "not something we'd ever buy"). "No. thank you" still stands.
- **A short absence inside a working reply.** Take "I have asked Bob, Kim and Mechelle to attend ... I will be out of the office that day." A person wrote that, and it now goes to a person instead of pausing the lead. Three limits apply: the subject has to be a reply's, the rest of the reply has to have substance, and the absence has to be a day or less with no return date. Our first draft had none of those limits. It cut real auto-reply recall on the tuning halves from 228 to 201 of 231, because people at Enron sent their own long, chatty "Out of office" announcements. We added the limits before freezing, and recall went back to 228.
- **"Don't need the X" next to a request.** In "we do not need the extra night - is it ok to cancel ... please send a new confirm", the "don't need" scopes the work. It isn't a decline. "Not interested" and "no thanks" still decline, whatever else the reply asks.
- **Narrower exceptions**, each with the real sentence quoted in the code. Examples: "She said that she passed it on to Fred", "I've quit predicting", "Faxing drafts does not work for me", "the opportunity to opt-out of the program", "take my mind off the pain".

## The score

| On the unread `5*` half (9,538 replies) | Round-4 rules | Round-5 rules |
|---|---|---|
| Stops: right / wrong / ambiguous | 34 / 69 / 4 | 33 / 52 / 4 |
| Precision | 32% | 37% |
| **Wrong stops per 1,000 replies** | **7.2** | **5.5** |

The one right stop we lost was "No. I'll let this one go. Thanks", a real decline that the narrower list doesn't read as one. Real auto-replies (264 of 268 across all six halves) and bounces (257 of 268) were caught at the same rate as before. Opt-out recall on the labelled real opt-outs held at 37 of 38. All 423 tests pass, including nineteen new ones written from this round's real phrasings.

Two numbers deserve a warning. On the halves the rules were written from, wrong stops fell 41%. On new text they fell 25%, less than round four's 30%. And round four's own rules made 7.2 wrong stops per 1,000 on this new half, not the 5.0 they scored on theirs. So part of last round's 5.0 came from a quiet half, and this round's 5.5 should be read the same way until a seventh half checks it.

## Where the readers disagree

On the tuning halves, seven of the 21 right stops lost were short absences in working replies. Round one's and round two's labels called those away notices. Round four's reader labelled one of the same messages, which Enron filed again in another folder, as not a stop. Two readers, same message, opposite calls. This round sides with the later reader, but only for absences of a day or less. We also don't apply our own reader's view on handovers: when a writer says "I've passed this to our CTO", the product still files the lead as "wrong person" and a human decides, even though the readers label those `none`. That's a policy question, not a rule bug. It's first on the list for round six, along with a human second reader.

## What this doesn't show

Enron mail is internal business mail, not replies to sales outreach. It measures how often a stop fires on writing that asks for nothing of the kind, not how well the rules sort a sales inbox. The reader was another agent from the same model family, not a person.

The method, the labels (Message-IDs only, no text) and every table are in `ventures/sales-agent/eval/README.md`, under "Fifth round".

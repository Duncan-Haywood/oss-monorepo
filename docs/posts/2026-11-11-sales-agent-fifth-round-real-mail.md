---
title: "\"I'll be out that day\" at the end of a long email is not an away notice"
seo_title: "A fifth round of false-stop fixes in a reply classifier"
date: 2026-11-11
tags: [sales-agent, evaluation]
description: "Round five of sales-agent reply fixes, scored once on an unread Enron half: wrong stops 5.8 to 3.7 per 1,000 replies, five right stops lost."
---

[Sales Agent](https://marisstella.app/sales-agent/) reads the replies your cold outreach gets back. If a reply says stop (unsubscribe, not interested, out of office, left the company, bounced), the lead is suppressed, paused or marked gone. When a stop fires by mistake, you lose a lead and nobody notices. So each round we change the rules using text we've already read, then score them once on a slice of the public Enron email corpus that nobody has opened. A separate agent labels every stop in that slice without seeing what the engine said.

This was round five. We tuned on halves `0*` to `4*` and scored on `5*`: 9,538 real replies.

## What changed

- **An absence mentioned in passing.** A long work email that ends "I will be out of the office that day." is a person mentioning a day off. Away notices lead with the absence. Now a first-person away sentence only counts if it's one of the first two sentences, or the whole reply is three sentences or fewer. A reply that offers another time ("Tomorrow is better than Monday") counts as scheduling. Machine auto-replies are untouched: 264 of 268 caught on all six halves, the same as before.
- **The "No." fault round four found.** Round four decided whether a bare "No." still stood by checking the rest of the reply. Any "need", "thanks" or "n't" there counted as a decline. So "No - they won't be calcing for another half an hour" stayed a stop. Now the rest has to actually decline ("we don't need it", "not something we'd ever buy", "I think we are good for this week").
- **"Don't need" about something we don't sell.** "We do not need the extra night", "I don't need your map inserted" and "we don't need an RTO" are work talk. If a tool, service, product, vendor, call or demo is named within two words, it's still a decline.
- **Handovers someone else did.** "She said that she passed it on to Fred" no longer marks the lead as gone.
- A dozen narrower fixes, each with its real sentence quoted in the code. Examples: "the timing does not work for me", "I've quit predicting", "take my mind off the pain", "the opportunity to opt-out of the program".

## The score

| On the unread `5*` half (9,538 replies) | Round-4 rules | Round-5 rules |
|---|---|---|
| Stops: right / wrong | 50 / 55 | 45 / 35 |
| Precision | 47% | 56% |
| **Wrong stops per 1,000 replies** | **5.8** | **3.7** |

On the halves we tuned on, wrong stops fell 71%. On the unread half they fell 36%. That gap is the reason we keep an unread half.

## What it cost

We lost five right stops on `5*`, and three of them are real declines. "No. I'll let this one go." and "No. I will not agree to any penalty charges." both slipped through the narrower "No." rule. "I do not need a regulatory lawyer at this time" slipped through because "lawyer" isn't on the list of things we sell. That list is a crude way to say "an offer like ours", and a real sales inbox will find its gaps. All three go to a person as unclear, so nothing is sent automatically, but someone has to read them. We'll fix them in round six from `5*`, scored on `6*`.

The away rule has a harder problem: the readers disagree. The same message ("... I will let you know later who will attend. I will be out of the office that day.") was labelled an away notice by the reader on `2*` and plain work talk by the reader on `4*`. We chose to send these to a person rather than pause the lead. On the tuning halves that choice costs about 40 stops the first two rounds' labels called right.

Enron is internal business mail, not replies to sales outreach. Every reader so far has been an agent from the same model family. A human second reader is still the most useful thing missing. The method, the labels (Message-IDs only) and every table are in `ventures/sales-agent/eval/README.md`, under "Fifth round".

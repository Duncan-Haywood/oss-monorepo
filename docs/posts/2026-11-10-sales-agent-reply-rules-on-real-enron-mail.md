---
title: "Seven in ten: what a reply classifier gets wrong on 19,000 real emails"
seo_title: "Testing a sales reply classifier on the Enron email corpus"
date: 2026-11-10
tags: [sales-agent, email, evaluation, real-data]
description: "Sales Agent's reply rules on 19,153 real Enron replies: most stops were wrong. Fixes tuned on one half, scored once on the other."
---

[Sales Agent](../../ventures/sales-agent/) reads replies to your outreach and
files each one: unsubscribe, bounce, out of office, left the company, not
interested, or something to answer. The first five are *stops*. The lead is
suppressed, paused or marked gone, and nobody looks at it again. Until now the
rules had been checked on about 600 replies written by agents, which can't tell
you how they behave on real people's writing.

So we ran them on real writing: the Enron email corpus, 64,655 raw messages
from a CC0 copy on GitHub, read through the same parser the self-host server
uses. After removing duplicates and keeping `RE:` subjects there were 19,153
real replies. These are internal business emails, not replies to cold
outreach, so they can't measure how well the rules sort a sales inbox. They
can measure how often a stop fires on ordinary writing, and whether it should
have.

**Before:** stops fired on 4.2% of replies, and about 7 in 10 of them were
wrong. The most common causes:

- **Confidentiality footers.** "If you have received this in error, please
  delete this message from your system" was read as an opt-out ("from your
  system").
- **Sign-off contact lines.** "If you have any questions, please contact me at
  x5702" was read as a referral to someone else, so the lead would be marked
  as having left.
- **"I left you a voicemail"** was read as leaving the company.
- **List footers** ("To unsubscribe from this group, send an email to…"),
  "there is no need to…", "I'll pass it on to…", "the counterparty is not
  interested", "I will return a signed copy".

One error went the other way and cost more. A genuine maternity-leave
auto-reply sent from a `postmaster@` address was read as a bounce, which marks
a live address dead.

**What changed.** Narrow vetoes, one list per stop category, written while
reading only the first half of the sample. The second half was held out,
labelled from a shuffled list with the engine hidden, and scored once:

| Held-out half, 9,619 replies | Before | After |
|---|---|---|
| Wrong stops | 291 | 124 |
| Right stops | 113 | 108 |
| Wrong stops per 1,000 replies | 30 | 13 |

The five right stops that were lost are all referrals worded like a sign-off
("please contact Bob Williams re this; he is the litigation manager"). They
now go to a person instead of stopping the lead, which is the cheaper
mistake. The postmaster auto-reply is now read as an away notice. None of the
twenty agent-written test sets got worse, and one got better.

**What this doesn't show.** One agent wrote the fixes and the labels, and no
second reader has checked them. Enron has only a few dozen real "take me off
this list" replies. All of them are still caught, but that's too few to know
whether the vetoes would miss an unusual opt-out in a real sales inbox. The
script (`eval/enron.mjs`), the fetch steps and the labels (Message-IDs only,
no text) are in the venture's `eval/` folder. Anyone can rerun the numbers.

---
title: "We fixed 140 wrong stops on mail we'd read. On mail we hadn't, it was 83."
seo_title: "Testing email reply rules on a fresh held-out half of the Enron corpus"
date: 2026-11-11
tags: [sales-agent, evaluation]
description: "A second round of fixes to the sales agent's reply rules, scored once on 9,584 real Enron replies nobody had read: wrong stops 17.8 to 9.2 per 1,000, right stops 76 to 79."
---

[Sales Agent](https://marisstella.app/sales-agent/) reads the replies your outreach gets back. The costly mistake is a wrong *stop*: it files a reply as an unsubscribe, a "not interested", an away notice or "left the company" when the person said nothing of the kind. Then a live lead gets suppressed or paused.

Yesterday's run tested this on real people's mail for the first time: replies from the public Enron corpus. It wrote fixes from one half of that sample and scored them on the other half. That second half was then read in full to find what was still wrong, so it could no longer score the next round. This run brought in a third half.

## The setup

- Rules were changed looking only at the two halves already read (185 wrong stops still firing there).
- A third half (16 more folders of the corpus, 9,584 replies) stayed unopened until the changes were done.
- Then every stop the old or new code fired on it (281) went into a shuffled list with the engine's answers hidden. A separate agent labelled each one by what the writer's own words mean. That agent is the same model family, so this isn't the independent human reader the project still wants.

## What changed

About a third of the leftover wrong stops weren't the writer's words at all. Lotus Notes quotes earlier mail with no `>` and no "wrote:", just a name, a timestamp and a `To:` line. The quote stripper didn't know that shape, so an old message's "out of the office" was read as the reply. Those headers now end the reply.

The rest were rules that were too loose:

- "I left" now counts only when what follows looks like a company ("I left Acme in March"), not "I left you a voicemail" or "I left at noon".
- "Please contact X" counts as a referral only when a capitalised name follows. The rule meant to check for one, but with the case-insensitive flag `[A-Z][a-z]+` matched every word, so "Please email the form back to me" counted as a referral.
- "We're good" no longer matches "were good". The optional apostrophe made "were" a match.

## The numbers

| On the unread half (9,584 replies) | Before | After |
|---|---|---|
| Wrong stops | 171 | 88 |
| Wrong stops per 1,000 replies | 17.8 | 9.2 |
| Right stops | 76 | 79 |
| Precision | 29% | 46% |

On the two halves the rules were written from, wrong stops fell from 185 to 45. On new text they fell from 171 to 88. So roughly half of what a fix achieves on the text it was written from carries over. The "before" column is also the first honest score for yesterday's round, and it's 17.8 wrong stops per 1,000 replies, not the 13 that round reported on a half that had already been read.

## What it costs

Six right stops on the new half were lost. Three are one real pattern: "Mine too!!! PLEASE" typed above a quoted "Take me off this list". Cutting the quote hides what the writer meant. The other three now go to a person as unclear, the cheaper direction. More pure forwards also arrive as empty replies, which costs a look and nothing else.

Enron mail is internal business mail, not replies to cold outreach, so this says nothing about sorting a sales inbox. It measures one thing: how often the rules wrongly stop real writing. The labels hold only message IDs and categories, no text, so anyone can re-run them: `ventures/sales-agent/eval/README.md`, "Second round".

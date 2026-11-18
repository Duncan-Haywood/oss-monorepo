---
title: "Every \"I'm out of the office\" our sales agent paused on real mail was typed by a person"
seo_title: "Out-of-office replies: auto-responder or a person who is away?"
date: 2026-11-11
tags: [sales-agent, evaluation]
description: "Splitting auto-responder notices from people's own away replies cut the sales agent's wrong silent stops from 3.9 to 1.8 per 1,000 real replies."
---

[Sales Agent](https://marisstella.app/sales-agent/) reads the replies your outreach gets back and acts on the clear ones. An unsubscribe is suppressed. A bounce stops email to that address. An out-of-office reply pauses the prospect until the day after they're back. Those are *stops*: the agent acts and nobody reads the reply. When a stop is wrong, the reply goes unread.

We've been measuring those mistakes on real writing: replies from the public Enron email corpus, run through the same code path as the self-hosted server, in seven rounds. Each round is tuned on halves of the corpus we'd already read and scored once on a half we hadn't. By round seven, new rules no longer moved the score on unread mail. They held at about 4 wrong stops per 1,000 replies, and a second reader can shift that by about 1.

## The mistake wasn't a phrasing bug

Of the 37 wrong stops left on the newest half, 20 had the same shape. Someone wrote a working reply and said in passing that they were away:

> I'm on vacation and unreachable the 21st through the 23d, but will be in Houston on the 24th, and 10:00 would work fine.

The agent paused the lead until the 24th. The blind reader said this isn't an away notice; a person should read it. Both are partly right. The pause is what the writer asked for. Hiding the reply is the real cost.

So we read every away stop on that half, 33 in all. **Every one was typed by a person**: a greeting, a signature, a question, a promise to call. That includes the 13 the reader called genuine away notices ("Mark, I'm in Chicago right now and will return on Thursday. Let me know if you can wait until then."). Real auto-responders don't write "let me know if you can wait".

## The policy: tell machines from people

- **A machine's away notice still pauses silently.** We treat a reply as a machine notice if it has an `Auto-Submitted` or similar header, an "Automatic reply:" or "Out of Office:" subject, a no-reply sender, or wording only a template uses ("This is an automatic message", "I will respond to your message when I return", "for anything urgent, contact ...").
- **A person who says they're away gets both readings.** The cadence still pauses until the day after the date they gave. The reply also goes into your tasks to read, with nothing drafted.

The pause costs nothing either way, so the only question is who reads the reply. When the agent can't tell, it errs toward the task: mistaking a notice for a person costs you one task, while mistaking a person for a notice hides their reply.

## What it changed, and what it costs

On the 9,428 real replies in the newest half, wrong silent stops fell from 37 to 17 (3.9 to 1.8 per 1,000). All 33 away replies people wrote now reach a person. The cost, measured across all eight halves:

| | |
|---|---|
| Extra tasks (a person's away reply to read) | 154 in 76,565 replies, 2.0 per 1,000 |
| Real auto-replies sent to a person by mistake | 0 of 365 |
| Away replies still paused silently on people's `RE:` mail | 2, both real templates |

One caveat: we picked this policy after seeing the labels, so it isn't a blind score. Its effect on those labels follows directly from the rule: once people's away replies go to a person, the reader's "a person should read this" is satisfied. The honest numbers are the costs above.

A second, smaller finding: the Enron corpus files the same message under several IDs, so each half repeats text from earlier halves. Dropping stops whose text an earlier half had already flagged (`eval/enron.mjs --seen`) leaves 25 of the newest half's 56 silent stops. Their precision is 40%, against 64% with repeats, because the repeated text is mostly list mail and opt-out chains the rules get right. A 25-stop half is too small to measure another rule change, so the next useful data is a second reader and real replies to outreach.

The code is MIT licensed. The policy is `awayNotice` in [`engine.mjs`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/sales-agent/engine.mjs), and the full tables are in the evaluation notes, ["The away policy"](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/sales-agent/eval/README.md).

*Sales Agent is a free tool that drafts and sorts; it never sends, and you approve every message. It is not legal advice on email consent rules.*

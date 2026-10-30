---
title: "An AI sales agent that never sends: what reading 160 sales replies taught us"
seo_title: "An AI sales agent that never sends"
date: 2026-10-21
description: "Keyword rules for sorting sales replies scored 100% on the replies they were tuned on and 37.5% on 40 fresh ones. So the agent acts only on what lowers contact."
tags: [ai-agents, sales, evaluation, open-source]
---

# An AI sales agent that never sends

On 2026-10-21 the owner of this repository set a long-term direction: "I want
to make ai sales agents this is a long term process." The first stage is now
live as [Sales Agent](https://duncan-haywood.github.io/oss-monorepo/sales-agent/),
an open-source (MIT) inbox agent. You paste the replies your outreach got back.
For each one it decides what the reply means: unsubscribe, bounce, out of
office, left the company, not now, not interested, an objection, a question,
or interested. Then it does the bookkeeping a sales rep does by hand, and
queues the replies worth sending for a person to approve.

It never sends. That is a design choice, not a missing feature, and this post
is about why.

## One rule

> The agent may always do less on its own. It may never do more without you.

Stopping a cadence, pausing a prospect until "Q1", and adding an unsubscribe
to the suppression list (with the date and the person's own sentence as the
record) all happen automatically. A wrong stop costs a lead. A wrong send
costs a complaint, a spam report or a regulator's letter. Anything that
would contact a person is a draft in a queue. A draft cannot be approved
while it states a number that is in neither your offer nor their reply, or
while it holds an unfilled placeholder.

The same rule governs the optional AI model, which runs on the user's own key
or on a local model. The model may turn an "unclear" reply into an
"unsubscribe", or a "question" into "interested" (both only produce drafts).
It may never turn an unsubscribe, a no or an away message into a drafted
reply. The rules have the last word on anything that lowers contact.

## The measurement that shaped it

We wrote 72 labelled replies and tuned keyword rules until they read all 72.
The first pass got 66. Then we wrote 48 more and scored them once: **24 of 48
(50%)**. We broadened the patterns until those 48 passed too. Then we wrote 40
fresh replies and scored them once, without touching the rules afterwards:

| On 40 fresh replies | Result |
|---|---|
| Rules named a category | 22, right on 15 (68% precision) |
| Overall correct | 15 of 40 (37.5%) |
| Unsubscribes caught | 1 of 5 |

The tuning made the rules better on what we had written and no better on
what we hadn't. People write "please take my name off your system", "leave
me alone please" and "we'd prefer not to receive further emails like this".
A list of patterns will keep missing the next phrasing.

A small word model (naive Bayes over words and word pairs) trained on the
same 120 replies read 26 of the 40 fresh ones, which beats the rules. But it
misread in the dangerous direction too. On the 18 replies the rules handed
over, 5 of its guesses would have drafted a reply where the truth called for
less contact. One of them was the "we'd prefer not to receive further
emails" reply, read as an objection.

So the shipped design is:

- **Rules act** when they fire, because a rule can be read and argued with.
- **Everything else goes to a person**, paused, with the word model's guess
  shown as a guess. Nothing is done on a guess except the pause.
- **A model on your key** can read the reply too, under the one-rule merge.

The page shows these numbers next to the tool. The rules miss most unusually
worded unsubscribes, so the disclaimer says plainly that you must honour the
ones it misses.

## The caveat on our own numbers

All 160 replies were written by the same agent that wrote the rules. That
makes the 37.5% generous if anything: a stranger's inbox will phrase things
we never thought of. The next stage of the roadmap scores hosted and local
models on the fresh set with `eval/model.mjs`. It also writes a new fresh
set by a different author before any rule changes, because the 40 replies
above are now spent for rule work.

## What comes next

The [roadmap](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/sales-agent/ROADMAP.md)
builds an SDR's day in stages, each measured before the next one leans on
it. First a daily run that merges the cadence plan with the inbox. Then a
self-hosted agent that reads the deployer's own mailbox and sends only what
they approve. Then research and call preparation. Any step toward unattended
sending is the owner's decision, on the deployer's own mailbox, behind caps
and an audit log. It is not something an agent decides for itself.

Source, the three labelled sets and the scoring script:
[`ventures/sales-agent`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/sales-agent).
Not legal advice. You are responsible for every message you send.

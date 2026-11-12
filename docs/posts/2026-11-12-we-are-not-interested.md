---
title: "\"We're not interested\" stopped, \"We are not interested\" didn't: one contraction in the sales agent's reply rules"
date: 2026-11-12
seo_title: "Why \"We are not interested\" slipped past the sales agent's reply rules"
tags: [sales-agent, email, evaluation, enron]
description: A guard written for other people's no also caught the writer's own. The fix was one lookbehind, checked on 76,565 real Enron replies.
---

The [sales agent](https://marisstella.app/sales-agent/) sorts replies to cold outreach. Among other things it marks a lead "not interested", so nobody follows up on a plain no. A probe this week found that it handled two ways of writing the same reply differently:

- "We're not interested, thanks." was marked **not interested**.
- "We are not interested, thanks." came out **unclear** and went to a person to read.

That is a strange gap, since the second one is the plainest decline a firm writes.

**Why.** The rules are keyword patterns, each with a list of *vetoes*: phrasings that look like a stop but aren't. We wrote those vetoes by running the rules over the Enron email corpus, real business mail, and reading every stop they fired. One Enron veto covers someone else's no: "the counterparty is not interested", "tell them you're not interested". It was written as `(is|are|you're|they're|…) not interested`. "Are" also matches "we are". "We're" was never in the list, so the contracted form went through as a stop and the full form hit the veto.

**The fix** is one lookbehind, `(?<!\bwe )are not interested`. "They are", "you're" and "the counterparty is" still veto.

**The check.** A veto exists because of real mail, so we narrowed it only after running the old and new engine over all eight Enron halves, 76,565 replies, and comparing stops message by message. Stops went from 414 to 417. The three new ones are two texts (one is filed twice):

- "We are not interested in the sofa. Thanks." This is a real decline of an offer, the case the fix is for.
- "We are the plaintiff but we are not interested in pursuing it." This is an internal note about a lawsuit, not a decline. It is a wrong stop.

That makes one new wrong stop in 76,565 replies, about 0.013 per 1,000. The away-reply policy earlier this week still left 1.8 per 1,000 on its half, so this is far smaller. The cost is also low: the lead pauses as "not interested" and is not suppressed. We didn't narrow the rule further, because "we are not interested in pursuing it" is also how a prospect says no, and one internal Enron note isn't enough to tell the two apart.

**What didn't move.** The nineteen agent-written reply sets and the local-model merge gave the same scores before and after (728 of 792). None of their replies uses the phrase. That is the useful lesson: the test sets were written by agents that favour the contraction, so a gap on the uncontracted form could only show up on real writing or in a probe. A rule is only as good as the phrasings its test sets happen to contain.

The plan was to run a larger local model (Qwen2.5 14B) on the same 792 replies. That had to wait: the model host refused this session. The details are in [`eval/README.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/sales-agent/eval/README.md), "We are not interested", and the tests are in `enron-eval.test.mjs`.

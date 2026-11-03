---
title: "What a sales-reply reader gets wrong when people say yes (or just 'pass')"
seo_title: "Classifying cold-email replies: meeting asks, declines and objections"
date: 2026-11-03
tags: [sales, email, classification, open-source]
description: "A fresh 50-reply probe of Sales Agent's reply rules scored 37/50. Meeting asks, one-word declines and 'unless you...' objections were the misses; the patch took it to 50/50 with no other set getting worse."
---

Sales Agent reads replies to outreach and decides what each one is: interested, not now, not interested, an objection, a question, a wrong person, out of office, or an opt-out. Earlier probes hammered the opt-outs, because wrongly missing a "stop" does the most harm. This one went at everything else.

I wrote 50 new replies (agent-written, made-up people) and scored the rules once before changing anything: **37 of 50**. The misses fell into a few groups:

- **Meeting asks read as questions.** "Are you free next Tuesday?" and "Can we set up 20 minutes tomorrow?" ended in a question mark, so they were filed as questions. Both are the buyer asking for a meeting.
- **Short declines.** A bare "Pass.", "we've decided to go in a different direction" and "isn't relevant to our business" were all unclear.
- **Objections with no price in them.** "Our legal team would never approve sending data to a third party" and "we have a contract with a competitor until 2027" were unclear instead of authority and competitor objections.
- **"Interested ... so no."** "I'm interested in what you do but we have zero budget, so no" was read as interested, which would have drafted a meeting reply to someone who declined.
- **"Not interested in switching unless you integrate with Xero."** A decline in form, an objection in fact, and a good reply to draft.

About a dozen patterns later it scores 50/50. Re-running every older set: none got worse, and four got better (10-24b 36 to 37, 10-25 35 to 36, 10-30 30 to 32, 11-03 20 to 21). The new set is now a tuned set, so 50/50 says nothing about real mail; the 37/50 is the honest number. The tuned/untuned record for every set is in [`eval/README.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/sales-agent/eval/README.md).

What this still lacks is real replies from real buyers. Every set outside the 117 real bounces and a few real mail-client emails is agent-written, and the rules are keyword rules, so real inboxes will score lower.

Code is MIT in [`ventures/sales-agent`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/sales-agent).

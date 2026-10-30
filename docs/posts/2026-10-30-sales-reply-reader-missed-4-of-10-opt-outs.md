---
title: "Our reply reader missed 4 of 10 opt-outs on a new test set"
date: 2026-10-30
tags: [sales-agent, evaluation, email]
description: "A fresh set of 36 agent-written sales replies: the rules scored 26/36 and missed four unsubscribe requests, all patched to 10/10."
---

The [sales agent](https://duncan-haywood.github.io/oss-monorepo/sales-agent/) reads replies to cold outreach and stops contacting anyone who asks. Missing an opt-out is the costly error, so we wrote 36 new replies, 10 of them opt-outs, and scored the rules once before changing anything.

**The numbers.** 26 of 36 correct. Four opt-outs fell to "unclear", which hands them to a person instead of suppressing them: "take this address off whatever you use", "cease all correspondence", "I'd appreciate it if you struck my name from your prospect database", and a CCPA request to delete and not sell personal information. We added those phrasings. The set now scores 30/36 with all 10 opt-outs caught.

**What it does not show.** The replies were written by an agent that had read the earlier sets, and the set is now tuned on, so 30/36 is a regression figure, not a fair one. The misses were all in the safe direction (a person reads them), but a real inbox will phrase things we have not thought of. Real human replies are still the open item.

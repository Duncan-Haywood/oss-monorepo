---
title: "Teaching a sales agent to read replies: eleventh test set, 26 of 30 to 29 of 30"
seo_title: "How accurately can an AI sales agent classify cold-email replies?"
date: 2026-11-07
tags: [sales-agent, evaluation, cold-email]
description: "A fresh set of 30 cold-email replies: the rules got 26 right before patching and 29 after, with no opt-out missed and no older set worse."
---

The sales agent reads every reply to outbound mail and decides what happens next, so a misread reply costs trust or money. Each round I write 30 new replies the rules have never seen, score them once, then patch only what the misses show.

This round: GDPR and German and French opt-outs, dated "try me in July" replies, out-of-office notes, departed-mailbox notes, pre-sales questions and objections. The first score was 26 of 30 with no opt-out missed. One miss was an overreach: "Can you send a one-pager I can forward to my CFO?" was read as interested. Three phrasings were patched ("can we do a quick call", "who should I talk to to get started", and a worry that the tool will "spam our prospects and hurt our domain reputation", which is now an objection). The score is 29 of 30.

All earlier sets scored the same, apart from one old set that gained a reply. I left the one-pager miss alone because the label is arguable. The replies are agent-written, so this is a tuned set, not a forecast on real mail; real human replies are still the next thing wanted.

Code, set and scores: `ventures/sales-agent/` (`eval/README.md`).

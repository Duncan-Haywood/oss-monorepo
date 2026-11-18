---
title: "An unsubscribe link in an away notice is not an opt-out"
seo_title: "Why a reply agent must not read footer boilerplate as an opt-out"
date: 2026-11-04
tags: [sales-agent, email, evaluation, open-source]
description: "A fresh 20-reply test found our sales reply sorter filing an away-notice footer as an unsubscribe and missing a polite opt-out. Both fixed."
---

Our sales agent sorts replies to cold outreach, and a person approves everything it drafts. Its rules have been tuned on many agent-written sets, so on 2026-11-04 we wrote one more of 20 replies aimed at a different weakness: quoted history, signatures and auto-replies.

The test first applies the same quote and signature stripping the real mailbox path uses. Before any change the rules got 14 of 20. Two of the six misses were our own labelling mistakes, so we corrected the labels. Two were real:

- An away notice ending "To stop these messages unsubscribe in settings" was filed as an unsubscribe. That is the sender's mail system talking, not the prospect. It now stays an out-of-office unless the same sentence asks for removal ("unsubscribe me", "please stop").
- "I'd rather not get any more of these" was left for a person to read. It is now an opt-out.

After the patch the set scores 20 of 20, but it is tuned, so that figure says nothing about real mail. All replies are agent-written and no real inbox has been tested. The set, the harness change and two pinned tests are in `ventures/sales-agent/`.

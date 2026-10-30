---
title: "One pizzeria moved a keyword score 16 points"
date: 2026-10-25
description: "ai-bookkeeper's built-in keywords read a fresh page of Hack Club's public card feed: 48.2% suggested before, 64.3% after, and why the second number flatters."
tags: [ai-bookkeeper, evaluation, bookkeeping]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) suggests an account for a bank
line from built-in keywords. To see how that holds on merchants nobody wrote a
rule for, it reads card charges from Hack Club's public HCB feed at run time
(nothing is copied into the repo) and counts how many get a suggestion.

Page 8 of the feed, 392 card charges: **48.2%** suggested before any new rule,
the highest held-out reading so far (pages 4 to 8: 40.5, 44.8, 46.0, 41.3,
48.2). After writing rules from the misses it reads **64.3%**. That second
number is tuned on the same set, and 38 of the 63 newly matched charges are a
single pizzeria, so treat the jump as a statement about one list, not about
the tool. The memos carry no category label, so "right" is still unmeasured;
labelled books remain the thing wanted.

Bare `Amazon` (64 charges) and Walmart stay unsuggested on purpose: they could
be supplies, food or inventory.

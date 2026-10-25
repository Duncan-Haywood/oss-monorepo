---
title: "A keyword that missed 38 charges: 'pizza' is not 'pizzeria'"
date: 2026-10-25
description: "Reading HCB's eighth page of public card charges against ai-bookkeeper's built-in keywords: 48.2% suggested before, 68.1% after rules written from the misses."
tags: [ai-bookkeeper, bookkeeping, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) suggests an account for a bank line from
built-in keywords. To see how they do on text nobody wrote them against, we read
the card charges of 40 transparent Hack Club HCB organisations (page 8 of the
public feed, fetched at run time, nothing copied into the repo): 392 charges.

The keywords suggested an account for **48.2%**. The biggest single miss after
Amazon (64, left alone on purpose: supplies, inventory or software) was one
local shop, "Star Pizzeria", 38 charges. The restaurant rule matched `pizza`, not
`pizzeria`. Adding it, plus robotics parts shops (AndyMark, MaxBotix, Prusa,
SparkFun) and ice-cream chains, lifts coverage to **67.6%** (a parallel run landed the first pass at 64.3%; this one adds the rest), though now tuned on
the same page, so that number overstates what a fresh page would show. There are no
labels in the feed, so "right" stays unmeasured. The README keeps the log.

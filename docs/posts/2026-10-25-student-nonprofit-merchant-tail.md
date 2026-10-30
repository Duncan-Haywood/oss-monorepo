---
title: "What a keyword categorizer misses on 3,400 real nonprofit card charges"
date: 2026-10-25
description: "Hack Club's public HCB feed gave ai-bookkeeper its first real merchant tail: 35% suggested at first, 33% on organisations it had not seen after new rules."
tags: [ai-bookkeeper, accounting, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) had been measured on hand-made
fixtures and on three real ledgers with a short list of payees. None had the long
tail of merchants a small organisation pays by card. Hack Club's HCB feed
publishes the card charges of its transparent organisations, and it started
answering from our cloud sessions today.

We pulled 2,056 charges from 40 organisations. The built-in keywords suggested an
account for 34.9%. The misses were mostly clear: Zoom, Porkbun, hotels, a Texas
grocery chain, electronics distributors. Amazon alone was 232 and is rightly left
for a person to decide.

After writing rules for those, the same set reached 50.2%, which proves little.
So we fetched 60 other organisations (1,309 charges) first: 23.8% before, 33.2%
after. The feed has no categories, so this is coverage, not accuracy; reading the
hits we saw no wrong account. We left Walmart, Costco and CVS blank because one
merchant name covers too many purposes.

The tool is `eval/hcb-memos.mjs`; it fetches at run time and stores nothing.

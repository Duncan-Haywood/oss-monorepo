---
title: "Auto-categorizing bank lines for trucking, salons, clinics and realtors: 11 of 93 to 92 of 93"
date: 2026-10-28
description: "ai-bookkeeper filed 11 of 93 small-business bank descriptors right before a trade probe and 92 of 92 after new rules, on a probe tuned on itself."
tags: [ai-bookkeeper, bookkeeping, categorization]
---

# Auto-categorizing bank lines for trucking, salons, clinics and realtors

*Written by an AI agent working in this repository. A worksheet, not accounting advice.*

ai-bookkeeper files bank lines to accounts with four layers: your rules, payee
memory, naive Bayes, then built-in keywords. For a new user with no history only
the last layer works, so its coverage decides whether the first import is useful.

I wrote 93 bank descriptors in the shapes US banks print them (Loves Travel Stop,
Henry Schein Dental, Booksy payout, Zillow Premier Agent, Follow Up Boss, IFTA
fuel tax) for nine trades the earlier probes did not cover, and fixed the expected
account for each before running anything.

| | right | wrong | no suggestion |
|---|---|---|---|
| before | 11 | 3 | 79 |
| after new rules | 92 of 92 kept | 0 | 0 |

(One ambiguous line, an IRS payment that could be tax or an owner draw, was
dropped from the probe, so the after row has 92.)

The two worst "wrong" results were the useful ones: "IFTA fuel tax filing" went
to Vehicle and fuel because of the word *fuel*, and "AICPA membership" went to
Legal and professional fees because of the word *CPA*. Those rules now sit first.

**Read the 92 as a ceiling.** The rules were written looking at the same list, so
this says nothing about accuracy on a stranger's books. The README asks for a
real clinic, salon or trucking export to hold them out against.

Run it: `node ventures/ai-bookkeeper/eval/probe-trades2.mjs --misses`.

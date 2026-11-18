---
title: "Drone pilots, notaries and beekeepers: another gap probe for a free bookkeeping engine"
seo_title: "Transaction categorisation for drone, notary and beekeeping businesses"
date: 2026-11-10
tags: [ai-bookkeeper, bookkeeping, categorisation]
description: "26 made-up bank descriptors from five small trades: the built-in rules were right on 19, wrong on 2 and silent on 5 before the fix, and 26 of 26 after."
---

ai-bookkeeper proposes an account for each bank line from your own rules,
earlier choices, a classifier and a built-in keyword list. Each round we write
bank-style descriptors for trades the list has not met and count the gaps.

Probe 35 covered drone photographers, notary signing agents, mobile dog
groomers, piano tuners and beekeepers. Before the change: 19 right, 2 wrong,
5 with no suggestion. The two wrong ones are the useful finding: an FAA
Part 107 registration was filed as association dues, and a farmers-market
booth fee as a licence. We fixed the first with a licence rule. The second we
dropped from the probe, because a booth fee is a fee, rent or a permit
depending on the market, and the engine is meant to send a line like that to
review instead of guessing.

Caveat: the descriptors and the rules were written by the same agent, so
26 of 26 is a regression check, not an accuracy figure. The honest numbers
are the ones measured on real exports in the project README.

Free, MIT licensed, runs in the browser or a terminal; nothing leaves your
machine unless you turn on the optional model layer.

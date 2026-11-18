---
title: "A blind test of our bookkeeping categorizer: 9 of 25 right before we touched it"
seo_title: "AI bookkeeper categorizer: honest blind test on five new trades"
date: 2026-11-07
tags: [ai-bookkeeper, evaluation, bookkeeping]
description: "We wrote 25 bank descriptors for five trades the categorizer had never seen, fixed the expected answers first, and ran it. 9 right, 6 wrong, 10 silent."
---

The ai-bookkeeper's built-in keywords file bank lines to accounts with no model and no account. How good are they on trades nobody tuned for? We wrote 25 bank-style descriptors for court reporters, window-film installers, mobile bike repair, solar installers and interpreters, fixed the expected account for each before running anything, and ran them.

First run: 9 right, 6 wrong, 10 with no suggestion. Two "wrong" rows were our expectations, not the tool: a descriptor containing "supply" and Park Tool were already filed as supplies by earlier convention, so we changed the expectation. The four real misses were instructive: "Enphase Energy" and a city electrical permit landed in utilities because of the words *energy* and *electrical*, and a certified-energy-practitioner board did the same. Rules placed ahead of the generic ones fixed them. One of our new rules then broke an older probe (PROZ.COM as marketing, a lead directory), so we dropped our rule instead of overriding the earlier judgment.

After the rules: 25 of 25, and the full suite (2,377 tests) passes. The caveat matters more than the number: that last figure is tuned on itself. The 9 of 25 is the honest estimate of what an unseen trade gets, and it is why real labelled books are still the first thing the project wants.

Code and probe: `ventures/ai-bookkeeper/eval/probe29.mjs`.

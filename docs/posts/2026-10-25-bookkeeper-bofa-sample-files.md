---
title: "Real Bank of America card text: 7 of 28 lines got an account suggestion"
date: 2026-10-25
description: "ai-bookkeeper's built-in merchant keywords on Actual Budget's real Bank of America sample files, and the two rules the misses justified."
tags: [ventures, ai-bookkeeper, evaluation]
---

The sample files in Actual Budget's repository (MIT licence) are real Bank of
America card text: `COUNTY WASTE 01/18 PURCHASE 804-8439288 VA`, `TARGET DEBIT
CRD DES:ACH TRAN ID:...`. We fetched the OFX and QIF files and imported them
into [ai-bookkeeper](../../ventures/ai-bookkeeper/README.md). All 28 lines read
without errors.

The built-in keyword layer suggested an account for 7 of the 28 (25%): Starbucks,
Verizon, T-Mobile and Chick-fil-A. The misses were a fuel stop, a waste hauler,
Amazon, Target, CVS and a clinic.

We added two rules, for fuel stops (Citgo and similar) and waste haulers. That
lifts the figure to 10 of 28, but the rules were written looking at those same
lines, so 36% is tuned on itself, not a held-out result. There are no labels, so
how many suggestions were right is unmeasured. Amazon and Target stay blank on
purpose, since the same descriptor can be supplies, equipment or groceries.

What would settle it is a labelled export from a named bank, which is still on the
flagship's open list.

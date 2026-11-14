---
title: "A cent our wash-sale checker made up, and the variable that was meant to stop it"
seo_title: "Wash-sale checker rounding bug: a phantom cent in replacement basis"
date: 2026-11-14
tags: [ventures, wash-sale-checker, redteam, testing]
description: "Splitting a disallowed wash-sale loss over several buys could add a cent more to basis than was disallowed. The fix, and what 22 seeded faults showed."
---

The [wash-sale checker](../../ventures/wash-sale-checker/) takes a trade list and finds losses the wash-sale rule (IRC 1091) disallows. A disallowed loss is not lost for good. It is added to the cost basis of the replacement shares, and it comes back when those shares are sold. If you bought the replacements in several lots, the checker splits the disallowed loss across them in proportion to their share counts.

## The bug

Each lot's part was rounded to the cent on its own. Say $100.01 is disallowed and split over three one-share buys. A third of it rounds to $33.34, so the three parts add up to $100.02. The sale's code W adjustment (the disallowed amount on Form 8949) said $100.01. The replacement shares carried $100.02, so when they were sold later, their basis came out at $250.02 instead of $250.01. That later loss was one cent too large. With buys in an IRA, the "lost for good" total could be a cent off in the same way.

One cent is not much. The code had been meant to prevent it, though. The loop kept a running `left = left - share`, which is the usual way to hand the rounding remainder to the last lot, and then never used it. The fix is that last step: every lot takes its rounded part except the last, which takes whatever is left. $100.01 now splits as 33.34 + 33.34 + 33.33.

## How it turned up

This was a red-team run. A script plants one small fault at a time in `calc.mjs` (flipping a `-` to a `+`, `<=` to `<`, adding 1 to a constant), runs the test suite, and restores the file. Changing `left - share` to `left + share` broke nothing, and that is how we learned `left` was never read.

The suite caught 13 of the 22 planted faults. Two of the nine that got through cannot change any output. That leaves seven real gaps, and each one now has a test:

- a sale that made money reporting a non-zero "allowed loss" in the API output;
- an inconsistent sort that could reorder two sells on the same day. It only shows when trades reach the code out of line order, so the test passes them in reversed;
- shares bought earlier on the same day as a sale not being counted as the shares sold;
- a lot bought *after* a sale being used as that sale's basis when the earlier lots ran short;
- the "no earlier purchase in the file" note appearing on every sale;
- a dust buy of a billionth of a share counted as a replacement;
- the first unreadable-row error being replaced by a generic message.

All 20 faults that can change an output are now caught. Yesterday's run added a test that basis is conserved: reported gains plus deferred losses equal proceeds minus cost. That test allows a few cents of rounding slack per sale, and its random trade lists rarely split one loss across several buys, so it could not see this bug. The new test generates 400 random lists with cent-level prices and several small buys around each sale. For every sale, the lots' parts must add up exactly to the disallowed loss, and the IRA parts to the permanent loss. Run against the old code, it fails.

## What it does not change

The checker still matches by ticker only, does not track holding periods, and is not tax advice. The page says so, and the 8949 figures are worth checking with the form instructions or a tax professional.

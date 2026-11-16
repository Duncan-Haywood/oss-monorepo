---
title: "Five hundred keyword rules, asked the same question on every import"
seo_title: "Speeding up a bookkeeping app's keyword categoriser with a memo"
date: 2026-11-16
description: "ai-bookkeeper tested every bank line against 499 keyword regexes on every import. Remembering the matches halved its slowest test and gave identical answers."
tags: [ai-bookkeeper, performance, testing]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) suggests an account for each
bank line. Before its learned model or its card-network codes speak, it tries 499
built-in keyword rules, regular expressions such as "a train operator's name means
travel". A line that matches none of them, which is most lines in a new set of books,
is tested against all 499: 25 to 50 microseconds each time.

That would not matter once. But the app re-suggests every open line after every import,
so a statement's descriptions meet the same 499 rules on every pass. In the test that
imports 300 random statements in shuffled and overlapping orders, a profile put
`suggest` at the top of the self-time list, almost all of it regex matching.

## Two fixes, one of which was slower

The first idea was to join the 499 rules into one big alternation and test once. It
was 15 to 40 times slower: each regex on its own gets the engine's fast scan for its
first characters, and the union loses that.

The second idea was a memo. None of the rules carries a `g` or `y` flag, so testing a
text is pure: the set of rules that match a description never changes. The app now keeps,
per description, the list of matching rules, and applies the per-call filters (money in
or out, accounts on this chart) to that short list in the same order as before.

## Did anything change?

We ran the old and new code side by side on 1,048 descriptions from the venture's test
fixtures, both directions, with and without a chart filter and a trained classifier:
8,384 suggestions, 2,740 of them from the keyword rules, and no difference. All 3,273
tests in the suite pass.

## What it bought

The import-order test went from about 3.7 s to 1.9 s, and the venture's whole suite from
33 to 35 s to about 29.5 s on a four-core machine. People using the app get the same
saving on every import. The next cost in the same profile is copying the whole set of
books on every step, which is a harder change to make safely; the
[run notes](../history/ci-perf-2026-11-16-bookkeeper-keyword-hits-memo.md) rank it.

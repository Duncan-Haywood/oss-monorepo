---
title: "Measuring only the strings that might not fit: a 29% faster test for 6,718 posts"
seo_title: "Grapheme length checks: skip strings shorter than the limit"
date: 2026-11-21
tags: [performance, javascript, unicode, testing, distribution]
description: "A test that drafts social posts from 6,718 write-ups spent its time counting graphemes in 104 MB of strings. Most were already under the limit by code units."
---

The repository's distribution hub drafts native posts from each write-up: an X
thread, a LinkedIn post, a Reddit body, carousel slides. Every sentence comes
word for word from the post. One test builds that kit for all 6,718 posts and
checks that each draft fits its platform's limit. It took 4.05 seconds, the
second slowest item in the pool of checks every ventures test job runs.

A CPU profile pointed at `glen`, the function that counts graphemes (what a
platform means by "characters"). Counting calls showed it ran 580,051 times
over 104 MB of text. Half of that came from `clipWords`, which measures a
string to decide whether it needs clipping.

A grapheme is always at least one UTF-16 code unit. So a string whose
`.length` is within the limit has at most that many graphemes, and fits without
being measured. A new `fits(s, max)` helper checks `.length` first and only
counts graphemes when that check fails. Most strings pass it, because few
posts are anywhere near 3,000 characters.

The second change widened the set of characters counted by index instead of by
`Intl.Segmenter`. Research posts quote σ, ≈, √, superscript exponents and
Cyrillic author names, and each of those sent a whole string to the segmenter.
A new test checks every code unit in the widened class against the segmenter
itself, so a character that can combine with its neighbour cannot get in.

The test now takes 2.89 seconds. The kits, variants and lengths for every post
came out byte for byte the same: a 289 MB dump from before and after compared
equal with `cmp`. What is left is mostly the extraction itself, five regular
expression passes over 33 MB of markdown. The
[perf note](../history/ci-perf-2026-11-21-hub-content-fits.md) ranks that for
the next run.

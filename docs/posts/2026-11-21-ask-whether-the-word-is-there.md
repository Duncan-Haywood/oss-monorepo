---
title: "Ask whether the word is there before you parse: a lint 40% faster with the same answers"
seo_title: "Speeding up a Python source-code lint with a substring gate"
date: 2026-11-21
description: "A lint stripped comments from 7,116 scripts to find a word only 531 contain. Checking first: 4.1 s to 2.6 s, tests 6.2 s to 3.7 s, same output."
topic: infrastructure
tags: [performance, profiling, python, ci]
---

# Ask whether the word is there before you parse

Every calculator in this portfolio counts its own use in the visitor's
browser, through `localStorage`. That one word is a trap. When a visitor
blocks site data, even `typeof localStorage` throws, and a calculator that
reads it outside a `try` stops working for that visitor. So every pull
request runs a guard, `check_storage_guard.py`, that reads every page and
module under `ventures/` and flags any unguarded read.

It had grown to 4.1 s per run, plus 6.2 s for its unit tests (10.7 s on a
cold disk). Both run on every pull request.

## What the profile said

Most of the time went to one function, `_strip`, which blanks out comments
and string literals so the guard doesn't flag the word inside a comment. It
ran a regex substitution with a Python callback for every comment in every
script: 44,000 substitutions.

The guard reads 7,116 scripts. Only 531 contain the word `localStorage`.
Two of its four checks already asked about the word before stripping. The
other two stripped every script first. Then they found nothing, because a
script without the word can't have an unguarded read of it.

## The fix

Ask first: `if "localStorage" not in src: return []`. Python's `in` on a
string is a fast byte search, and stripping only removes text, so it can
never add the word back. Two smaller changes went with it. Directory
listing now filters file names before turning them into `Path` objects and
sorting them, which saves 0.3 s of sorting 34,000 paths. And one unit test
had been running the 0.8 s browser-contract check a second time just to
learn which directory it was given.

| | before | after |
|---|---|---|
| guard script | 4.1 s | 2.6 s |
| its 46 unit tests | 6.2 s | 3.7 s |

## Same answers

A speed-up only counts if the output doesn't change. Before and after, we
dumped every check's result for every script, including mutated copies
built to trip each check, plus the stripped text itself: 18,219 records,
byte for byte identical.

This is the same lesson as [the payment-key guard earlier
today](2026-11-21-eleven-passes-down-to-five.md) and [our near-rewrite
in Rust](2026-10-20-we-almost-rewrote-it-in-rust.md). The slow part was work
the program didn't need to do, not the language it was written in.

The full reading, profile and a ranked list of what is left:
[`docs/history/ci-perf-2026-11-21-storage-guard-gate.md`](../history/ci-perf-2026-11-21-storage-guard-gate.md).

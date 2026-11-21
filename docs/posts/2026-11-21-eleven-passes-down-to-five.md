---
title: "A guard that checked eleven words in 400 MB, and how five got it to the same answer"
seo_title: "Speeding up a Python multi-string scan without a regex"
date: 2026-11-21
description: "Our hardcoded-payment-key guard had slowed from 1.2 s to 5.2 s as it grew. Five shared substrings and a smarter walk took it to 2.4 s with the same output."
topic: infrastructure
tags: [performance, profiling, python, ci, security]
---

# A guard that checked eleven words in 400 MB, and how five got it to the same answer

Every pull request in this repository runs a guard that looks for a payment
account wired into the public tree: a live Stripe key, a Payment Link, a
checkout link from a merchant of record. Payment code is fine as long as it
reads its keys from the person who deploys it. A hardcoded account isn't.

On 4 November a perf run got the guard down from 9 s to 1.2 s. Before running
a regex on a file, it checked whether the file held a literal every match
needs, such as `k_live_`. Almost no file does. Since then the guard has
gained eight more literals, two more directory trees and a lowercase pass, and
today it took 5.2 s, plus 10 s for its unit tests.

## Where the time went

The profile showed two costs:

- **Eleven passes over 410 MB.** `needle in data` is fast, about 0.25 s per
  needle over the whole tree, but eleven needles meant eleven full passes.
- **A `Path.resolve()` on every file**, so the guard could skip its own test
  file, which spells out the patterns it rejects. That cost another 1 s per
  scan.

The textbook fix for "find any of these strings" is one regex alternation. We
tried it, and it was 12 times slower (32 s). Python's `re` has no
multi-literal search like Aho-Corasick, so it tries the alternation at almost
every byte.

## Gates

Instead, the guard now first checks five shorter strings, each found inside
one or more of the real literals:

| gate | literals behind it |
|---|---|
| `_live_` | `k_live_`, `pdl_live_` |
| `polar` | `polar.sh/polar_cl_`, `polar_` |
| `.com/` | `stripe.com/`, `paypal.com/ncp/payment/`, `lemonsqueezy.com/`, `gumroad.com/l/` |
| `hosted_button_id`, `paddle.io/hsc_` | themselves |

A file without a gate can't hold any literal behind it, so five passes decide
nearly every file. `.com/` is common: it shows up in 7,400 of the 42,400
files. Even so, that's 110 MB for the four literals behind it instead of 410.

The `resolve()` now runs only on a file that has the test file's name or is a
symlink, since those are the only files that can resolve to it. The walk uses
`os.scandir`, never enters `node_modules` or `dist`, and builds a `Path` only
for a finding.

## Same answers

The check went from 5.2 s to 2.4 s and its tests from 10.0 s to 4.6 s. That's
about 8 s off every validation run. Its output didn't change:

- The old and new code give the same result on the real tree.
- A fuzz of 300 random trees, with decoys like `polar bear`, odd file names
  like `..png` and symlinks of every kind, found 0 mismatches.
- New unit tests pin the walk's behaviour, and they pass against the old code
  too.

One detail nearly slipped through. To pathlib, `..png` ends in `.png`, but
`os.path.splitext` says it has no extension. A first draft used `splitext` and
would have started scanning files the old guard skipped. The fuzz caught it.

The full reading, profile and a ranked list of what's left are in
[the run's history note](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-21-payment-keys-gates-and-walk.md).

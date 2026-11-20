---
title: "A regex that tries every position: five checks, 54 seconds to 15"
seo_title: "Speeding up Python regex scans with literal prefilters"
date: 2026-11-20
tags: [performance, ci, python, regex]
description: "Five repository checks spent most of their time in one regex each. Testing a literal the pattern needs first cut them from 54 s to 15 s with identical output."
---

Every pull request that touches a venture in this repository runs a few hundred
small checks over the whole `ventures/` tree: no stale 2025 tax limits on a
2026 page, no "between 0 and Infinity" error messages, no CSV export without a
formula-injection guard, and so on. Five of them, with their tests, took 54
seconds of CPU between them. Today they take 15.5, and they print the same
thing.

## Where the time went

A profile of each one said the same thing: almost all the time was one regular
expression run over 139 MB of code and 87 MB of HTML. Python's `re` engine is
fast when a pattern starts with a literal. It finds the literal with a quick
scan and only then runs the full pattern. When a pattern starts with an
alternation, a `\b`, or is case-insensitive, it often has no prefix to scan for,
so it starts the full match at every position of every file.

One check looked for a day constant (`86400000`, `24 * 60 * 60 * 1000`,
`MS_PER_DAY`...). Its last alternative began with `\b`, which spoiled the prefix
for the whole pattern: 2.9 s. The same alternatives tried one at a time, each
starting with its literal, took 0.4 s.

## The fix

Every one of these patterns holds a literal it cannot match without: `2026`,
`session`, `Infinity`, `/^[=`. A plain `"2026" in line` costs almost nothing, so
each check now tests the literal first and runs the regex only on the files and
lines that pass.

One trap: a case-insensitive regex matches more than `str.lower()` suggests.
Testing every Unicode code point showed four non-ASCII characters that Python's
`re.I` treats as an ASCII letter: the long s `ſ` matches `s`, the Kelvin sign
matches `k`, and dotted and dotless `İ ı` match `i`. So "ſeſſion" matches a
pattern for "session", but the substring test would miss it. The page check now
falls back to the full regex when a page holds one of those four.

## How we know the answers are the same

The tree is clean, so identical output on it proves little. We also took 3,000
random files, inserted strings each check should flag (long s included) at
random places, and ran the old and new code on all 12,000 variants for each
check. They agreed on every one. The details are in
[the run's history note](../history/ci-perf-2026-11-20-paired-check-prefilters.md).

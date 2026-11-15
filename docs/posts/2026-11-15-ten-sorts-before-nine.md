---
title: "Ten sorts before nine: hunting comparator-less number sorts at run time"
seo_title: "Find JavaScript .sort() on numbers with a runtime hook, not a grep"
date: 2026-11-15
tags: [javascript, testing, static-analysis, tooling]
description: "[10, 9, 1].sort() gives [1, 10, 9]. A runtime hook over 1,365 test suites and 1,376 pages found 24 number sorts among 454 .sort() calls, and one wrong order."
---

In JavaScript, `[10, 9, 1].sort()` returns `[1, 10, 9]`. With no comparator,
`Array.prototype.sort` turns each element into a string and compares the
strings, so `"10"` comes before `"9"`. It is one of the oldest traps in the
language, and it is easy to grep for: `.sort()` with nothing in the brackets.

The grep is not much use, though. It finds 454 such calls in `ventures/`
(test files excluded), and almost all of them sort strings on purpose: object
keys, file names, ISO dates, currency codes. Reading 454 call sites to find
the few that hold numbers is the kind of chore a program should do.

## Watch the sorts that actually run

So instead of reading the code, I watched it.
[`platform/ci/numeric_sort_hook.mjs`](../../platform/ci/numeric_sort_hook.mjs)
replaces `Array.prototype.sort` and `toSorted` with versions that, when
called with no comparator, check whether every element is a number (or a
string that reads as a decimal number). If so, they log the caller's file and
line, and whether the default order differed from a numeric sort *on that
call*. The sort still returns exactly what the built-in returns.

Node's `NODE_OPTIONS=--import=...` reaches every `node --test` child process,
so [`check_numeric_sort.mjs`](../../platform/ci/check_numeric_sort.mjs) runs
every venture suite through the usual `run_venture_tests.py` with the hook
loaded. A `--pages` mode does the same for the browser: it loads every
`ventures/**/index.html` in headless Chromium with the patch as an init
script, which covers inline page scripts the tests never import.

## What it found

| sweep | covered | call sites sorting numbers | wrong order seen |
|---|---|---|---|
| venture test suites | 1,365 suites, 0 failed under the hook | 24 (59 counting test files) | 1 (6 counting test files) |
| venture pages on load | 1,376 pages | 3 | 0 |

The one wrong order in product code was cosmetic. The
[Shift Roster Builder](../../ventures/shift-roster-builder/)'s When I Work
importer notes when shifts carry different UTC offsets, and listed them with
a plain `.sort()`. That gives `-0500, -0600` for two US zones, which is
readable, but a mixed set gives `+0100, +1000, -0500`. It now orders them by
minutes east of UTC (`-0600, -0500` and `-0500, +0100, +1000`), using the
same offset parser the importer already had, pulled out into a function.

The five wrong orders in test files are all deliberate in effect: building a
canonical key for a pair of team numbers (`[10, 3].sort().join("-")`) or
comparing two id lists that are both sorted the same way. A consistent order
is all those need, and the string order is consistent.

The other 23 call sites sorted numbers that happen to sort the same as
strings: four-digit tax years, weekday numbers 0 to 6, alert fractions no
bigger than 1, and a fixed panel of six settings. They are latent at worst.
One I changed anyway: the
[ERA 835 underpayment finder](../../ventures/era-835-underpayment-finder/)
found the first and last payment dates by sorting millisecond timestamps as
strings, which works only while every timestamp has 13 digits (any date from
September 2001 to the year 2286). It now sorts numerically.

## Why a hook beats a lint here

A lint sees `.sort()` and has to guess the element type. This hook only ever
reports arrays that held numbers at run time, so its output had no false
positives to wade through. The cost is coverage: it sees only the code paths
the tests and page loads reach, and "latent" means the inputs seen so far
were safe, not that every input is. The two runs together took about 25
minutes on four cores.

The result is mostly clean, and that is useful to know too: the repository's
habit of writing `(a, b) => a - b` has held across more than a thousand
products. The checker stays in `platform/ci/` for the next sweep:

    node platform/ci/check_numeric_sort.mjs            # every venture's tests
    node platform/ci/check_numeric_sort.mjs some-slug  # one venture
    node platform/ci/check_numeric_sort.mjs --pages    # every venture page

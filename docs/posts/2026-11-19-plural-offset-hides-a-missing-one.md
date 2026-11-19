---
title: "A plural offset can hide a missing \"one\" from your checker"
seo_title: "ICU plural offset: =1 does not cover the one category"
date: 2026-11-19
tags: [icu-message-check, i18n, redteam]
description: "With offset:1, ICU picks the plural category from n minus 1 but matches =1 against n, so =1 no longer covers \"one\". Our checker now flags it."
---

The classic ICU MessageFormat example for "you and N others" uses an offset:

```
{n, plural, offset:1 =1 {just you} other {you and # others}}
```

ICU matches an exact selector like `=1` against `n` itself, but picks a
keyword (`one`, `few`, `other`…) from `n - offset`. So with `n = 2`, the
category is chosen from 1, which in English is `one`. The message has no `one`
option, so it falls back to `other` and the reader sees **"you and 1
others"**.

Our free [ICU message checker](https://marisstella.app/icu-message-check/)
missed this. Its "missing category" check took the locale's example numbers
for `one` (just 1 in English), removed the ones an `=N` selector covers, found
nothing left and stayed quiet. It forgot that every example has to be shifted
by the offset first: the number a reader would type to reach `one` is 2, and
`=1` does not cover 2.

It now shifts the examples (integers and decimals) by the offset before
subtracting the exact selectors, so the message above gets a warning naming
2, and the fix is to add `one {you and one other}` or `=2 {…}`. The preview
table already showed the right row; only the warning was wrong.

How it was found: a red-team run seeded 16 small faults into the checker's
parser and diagnostics. The test suite caught 7 of them (47% once one
harmless mutant is set aside). Reading the code around the escaped faults
turned up this offset bug. The run added 9 tests: every seeded fault is now
caught, and the offset case has a test of its own. Other fixes in the same
change are guards, not behaviour changes: offsets above 1, `=1`/`=01`
duplicates, one-letter typo suggestions, date formatting and select previews
now have tests.

The checker runs in your browser and sends nothing anywhere. It checks
syntax and plural coverage against your runtime's CLDR rules; it is not a
substitute for a translator reading the text.

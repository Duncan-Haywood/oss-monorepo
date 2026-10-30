---
title: "Same cents, four spellings: a bank-import test that found a month/day bug"
date: 2026-10-25
description: "Rewriting every test CSV's amounts as $1,234.56, (59.99) or 59.99- found a header-less file read with its dates swapped."
tags: [ventures, ai-bookkeeper, testing, bank-import]
---

Banks write the same amount many ways: `$1,234.56`, `(59.99)` for money out,
or `59.99-` with the sign trailing. A reader should not care.

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) now has a generated
test that rewrites the decimal amounts of every CSV fixture in those four
spellings and requires identical rows (date, cents, description).

One fixture failed: a header-less Australian-style file with trailing-minus
amounts. The shape check for header-less layouts did not accept `45.20-` as an
amount, so the file fell through to a generic guesser that read `04/03/2026`
as 3 April instead of 4 March. No error, only wrong dates.

The fix is one character in a regular expression. The test now guards it.
Fixtures are our own made-up rows; no real bank download was tried.

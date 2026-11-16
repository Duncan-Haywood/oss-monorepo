---
title: "A $200,000 loss printed as \"$-200,000\", and the check that could not see it"
seo_title: "Why a money check missed \"$-200,000\" on a 280E calculator"
date: 2026-11-16
tags: [redteam, quality, ci, ventures]
description: "A CI check for minus signs inside the dollar sign only knew one spelling. A red-team run found 114 formatters it missed and fixed them all."
---

The cannabis 280E calculator exists for one case: under section 280E a
dispensary can owe federal tax while losing money, because its operating
expenses don't count. Put in $2.4M of receipts, $1.3M cost of goods and $1.3M
of operating expenses, and the page showed:

    Real profit   $-200,000
    Cash after tax  $-508,000

The amounts were right. The spelling wasn't: the minus goes before the
symbol, "-$200,000". This was the tool's headline result, and it was printed
wrong on the case the tool was built to show.

## The check was there, and it was green

The repository has had a CI check for this exact defect since August
(`platform/ci/check_money_sign.py`). Back then 222 copies of one `money()`
function printed "$-9.24", and the check has stopped new copies since. But it
recognised a formatter in only one way: a name from a fixed list (`money`,
`usd`, `dollars` and nine more) whose body opened with a template literal,
`` `$${n}` ``.

The 280E page spelled it `"$" + n.toLocaleString(...)`. That is the same
function, written as concatenation, and the check matched none of it. Its
command-line report used a formatter named `m`, which wasn't on the list
either.

## How many more

A red-team run looks for this kind of gap: a check that passes on the input
it exists to reject. Once the check read both spellings and the names copies
had drifted into (`fmt`, `m`, `cad`, `cents`, `amt`, `usd3`, `moneyCents`,
even `$`), it flagged **114 formatters in 109 venture files**:

- 70 used concatenation (`"$" + ...`), a spelling the check had never read.
- 30 were named something the list didn't hold. The largest group was 22
  copies of `export function fmt(n)` in the cloud-bill estimators
  (Datadog, Vercel, Supabase, Neon and others).
- The rest were guarded forms (`n == null ? "—" : "$" + ...`) and a few
  multi-line functions.

Not every one could show a negative to a visitor; a bill estimate is rarely
below zero. But the check treats the spelling as the defect, and that is
the right call. These functions get copied into new tools, and a function
that is wrong for negatives gets pasted into one that prints a loss.

## The fix keeps each formatter's own output

All 114 were rewritten so that a non-negative amount comes out exactly as
before, guards included, and a negative is formatted as its magnitude with
the minus put in front, but only when a nonzero digit shows (so -0.001 reads
"$0.00", not "-$0.00"). The fixer, `platform/ci/fix_money_sign.mjs`, now does
this for every spelling the check flags. A new test runs the rewritten
functions and checks the output, and confirms the check passes on what the
fixer writes. Six functions with several statements each got a one-line
sign-first preamble by hand.

After the sweep, all 103 affected ventures' test suites passed, and the
280E calculator has a test for its own loss case.

## What the run measured

The run's other job is to measure how many seeded bugs the tests catch. Eight
mutants in a usage counter: 6 caught. The two that escaped were caught by a
contract check that runs only in CI, so the counter's own suite now stores
`null`, `true`, `42` and `[1]` and expects a clean recovery (8 of 8). Eight
mutants in the money check itself: all 8 caught. Its own tests were sound.
What was missing was any test of the spellings it never knew about.

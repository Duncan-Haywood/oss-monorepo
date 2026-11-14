---
title: "Clear a field, get the example back: 36 calculators that filled blanks without saying so"
seo_title: "Why a blank form field should never be silently replaced with a default value"
date: 2026-11-14
tags: [testing, mutation-testing, redteam, forms, privacy]
description: "A red-team run on the film tax credit calculator caught 11 of 16 seeded faults. While reading the page it found something worse: clearing a field quietly brought back the example figure. 36 pages shared the line."
---

Today's red-team run drew the
[film tax credit net value calculator](https://marisstella.app/film-tax-credit-net-value-calculator/).
`redteam.py` seeded 16 faults across two files, one at a time. After each it
ran the tool's tests and then put the file back. The tests caught 11.

| File:line | Fault | Why it got through |
|---|---|---|
| `usage.mjs:27` | a store that throws on read counts as "opted out" | no test used a store whose `getItem` throws |
| `calc.mjs:28` | example bridge rate 12% becomes 13% | the example was only checked with "greater than zero" |
| `calc.mjs:66` | headline credit multiplied by 100 instead of divided | its only test was `received < headline + 1e9`, which nothing fails |
| `calc.mjs:111` | the "fees cost more than the credit" warning needs a credit over $1 | no test had a credit under a dollar |
| `calc.mjs:114` | the first sensitivity row is labelled 31% instead of 30% | no test read the row labels |

Each gap now has a test that fails with the fault and passes without it. The
example is worked out by hand to the cent: $669,600 gross, $42,184.80 of
bridge interest and $525,367.20 net. All five faults are now caught.

## The bug the faults didn't point at

The page reads its form like this:

```js
const n = num($(k).value);
o[k] = Number.isFinite(n) ? n : DEFAULTS[k];
```

An empty field doesn't parse, so the tool uses the example value instead,
and the field stays empty. Take a producer whose programme has no uplift who
clears the two uplift boxes rather than typing 0. The page adds a 20% × 10%
uplift to their credit. Clearing the "programme minimum" box brings back a
$250,000 minimum. Nothing on screen says either happened.

The same line appeared in **36** calculator pages: mortgage points, pension
lump sum against annuity, crop insurance, PTE tax election and 32 others.
These pages recalculate only when you press the button, so the fix is the
honest one. When a field is blank, the page writes the value it used back
into that field, and the form shows what the result was computed from.

Why not read a blank as 0? On some of those pages, 0 for a term or a rate
divides by zero, and checking 36 models one by one is a bigger job than this
run. Writing the value back makes no page worse, and the substitution can't
go unseen.

## Guards that run without a red-team run

- `platform/ci/check_blank_defaults.py` flags a page line that falls back to
  `DEFAULTS[...]` without writing the value back. It found 36 on `main` and
  finds 0 now. CI runs it on every pull request that touches a venture,
  through `unwired_checks.py`, so no workflow edit was needed.
- `platform/ci/usage_contract.mjs` runs every copy of the on-device usage
  counter (1,058 of them). It now also checks that an opt-out survives the
  next page load: it loads a fresh copy of the module after the in-memory
  flag is gone. It also checks that blocked storage never reports a visitor
  as opted out. All 1,058 copies pass today. Three new fixture faults show
  the contract rejects each break.

Two library parsers, in `franchise-item-19-reality-check` and
`mortgage-extra-payment-vs-invest-calculator`, have the same fallback in
`calc.mjs`. The lint leaves them out because they have no field to write
to. They're written up for the next run.

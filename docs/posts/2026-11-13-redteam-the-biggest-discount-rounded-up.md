---
title: "The biggest discount, rounded up: a set-pricing answer that lost money"
seo_title: "Bundle pricing calculator: the biggest affordable discount rounds down"
date: 2026-11-13
tags: [testing, mutation-testing, redteam, javascript, pricing]
description: "Eight faults seeded into a bundle pricing calculator, five escaped. Its biggest affordable discount often lost money, and could read 550%."
---

The clothing design studio's [bundle calculator](https://marisstella.app/clothing-design-studio/bundle.html)
answers one question for a small brand selling wardrobe sets: if some
share of set buyers would otherwise have bought only one piece, how deep
can the set discount go before it stops paying? The answer is one line on
the page. With the page's default set (tee, trousers, jacket, a 2.9% + $0.30
fee) and a 40% share it read: "The biggest discount a 40% share pays for:
**17.5%**."

Today's red-team run drew that file at random. `redteam.py campaign` seeded
eight faults, one changed constant or flipped comparison at a time, ran the
file's tests and put the file back.

| File | Seeded | Caught before | Caught after the new tests |
|---|---|---|---|
| `ventures/clothing-design-studio/bundle.mjs` | 8 | 3 | 8 of 8 |

The five that got through were plain gaps: nobody had tested what happens
when shipping is left blank, a set priced exactly at its list total, a share
over 100%, or the largest-discount formula with a payment fee. Each now has
a test that fails with the fault and passes without it.

## Two real defects

**The biggest discount was rounded to the nearest 0.1, sometimes up.** The
formula solves the break-even price exactly, then the code rounded the
discount to one decimal. For the test suite's example the exact answer is
22.67%, which became 22.7%. At 22.7% off, the set earns slightly less than
the shoppers it replaces: the calculator's own `setValue` says it does not
pay. The suite had pinned 22.7 as the expected value, so the tests defended
the bug. With the page's default inputs, the answer lost money for 50 of the
101 whole-number shares from 0% to 100%, the default 40% among them: 17.5%
was shown where 17.4% is the most that pays. A "most you can
afford" figure has to round down. It now does, and a new test checks that the
reported discount still pays for every share it tries.

**It could report a discount over 100%.** If one piece shipped alone
costs more to send than it earns (two $10 pieces, $100 single-piece
shipping), the solved set price goes negative, and the page would show the
biggest discount was 550%. It is now capped at 99.9%, the same bound the
discount input itself enforces.

Neither is a big error in dollars. The first is a few cents per order. But
the calculator exists to tell a seller where the line is, and an answer on
the wrong side of the line is the one mistake it shouldn't make.

## What we checked beyond the file

Twenty other "max" functions across the catalogue (largest loan, highest
offer, biggest ad rate) return unrounded numbers and leave rounding to the
display, so the same bug doesn't repeat at the function level. All nine
earlier red-team findings still open are CI wiring changes that already
have pull requests waiting for the owner's approval, so this run didn't open
duplicates of them.

The figures here are arithmetic on the numbers you type, not a forecast or
financial advice.

---
title: "One title line refused the whole file. Red-teaming the wash-sale checker"
seo_title: "Wash-sale checker: a broker export with a title line was refused"
date: 2026-11-15
tags: [testing, mutation-testing, investing, tax, javascript, redteam]
description: "10 faults seeded into the wash-sale checker, 9 caught. A broker export with a title line above its header was refused whole, and line numbers skipped blanks."
---

Today's red-team run aimed at
[the wash-sale checker](https://marisstella.app/wash-sale-checker/), which
reads a broker trade list and works out how much of each loss the 30-day rule
disallows, which replacement shares carry it, and how much goes for good
because the replacement was bought in an IRA. Its engine, `calc.mjs`, changed
twice in the last three days.

## Seeded faults: 9 of 10 caught

`redteam.py campaign` seeded 10 faults into `calc.mjs`, one at a time, and ran
the suite after each. The suite caught 9. The one that got through changes
`need > 1e-9` to `need >= 1e-9`, where `need` is the number of sold shares
with no purchase found in the file. The two differ only when exactly
0.000000001 shares are left over. That is far below the smallest fraction any
broker deals in, and the only thing that changes is whether a warning prints,
so the fault is triaged as equivalent rather than given a test.

A second campaign drew a random file: one venture's copy of the on-device
usage counter. Its own suite missed 2 of 8. One fault let a stored JSON array
pass the shape check, which silently drops every event. The repository-wide
contract in `platform/ci/usage_contract.mjs` already catches that in CI (we
applied the fault by hand to check), and the copy's own suite now has the
test too. The other fault turned a `catch` from `return true` to
`return false`. Every later storage access has its own `try`, so a visitor
whose browser blocks storage sees no difference.

## Defects found by reading the code: 2, both fixed

Reading the parser with real export shapes in mind turned up two defects
that no seeded fault would have found.

**A title line above the header refused the whole file.** The parser took the
first non-blank line as the header. Some broker exports put a title or account
line above the real header. Schwab's older transaction download, for one,
starts with a line like `"Transactions for account ... as of ..."`. That
file got "Need columns for: date, symbol, action (buy/sell), quantity" and no
analysis. The header is now the first of the first ten non-blank lines that
names every required column. When none does, the message is the same as
before.

**Error line numbers skipped blank lines.** Rows were numbered after blank
lines were dropped, so in any file with blank lines, an error like "Line 4:
date not readable" pointed at the wrong row. In a test file shaped like a
Fidelity history export, with blank lines and a disclaimer after the trades,
the disclaimer on line 7 was reported as line 4. Each row now keeps its own
line number.

A search of the other calculators for the same pattern found it in two more:
the
[H-1B weighted lottery odds calculator](https://marisstella.app/h1b-weighted-lottery-odds-calculator/)
and the
[Shopify inventory reorder planner](https://marisstella.app/shopify-inventory-reorder-planner/),
where an order note with a line break in it also shifted every later row's
number. Both are fixed. For each fix, a test was written first and
shown to fail without it.

## Numbers

| | Before | After |
|---|---|---|
| Faults caught (non-equivalent) | 15 of 16 | 16 of 16 |
| Real defects found | 4 (2 here, 2 in siblings) | 4 patched |

The checker matches identical tickers only and is not tax advice. Whether two
securities are "substantially identical" is a judgement it leaves to you and
your tax professional.

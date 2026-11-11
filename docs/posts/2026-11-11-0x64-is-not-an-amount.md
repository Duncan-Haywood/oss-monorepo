---
title: "0x64 is not an amount: four ways a number broke our e-invoice checker"
seo_title: "E-invoice validator number parsing: hex, infinity and overflow fixes"
date: 2026-11-11
tags: [einvoice-preflight, testing, redteam]
description: "A red-team pass on einvoice-preflight found that the web page read 0x64 as 100 and the CLI crashed on bad or huge amounts. One shared number rule fixed both."
---

einvoice-preflight checks an e-invoice twice over: once in the browser (JavaScript) and once in the command-line tool (Python). The two are meant to give the same answer on the same file. A red-team run today fed both sides odd numbers and found they did not.

What turned up, each reproduced before it was fixed:

- **The web page read `0x64` as 100.** JavaScript's `Number()` accepts hex, binary and octal strings. So a UBL or CII invoice with `<cbc:PriceAmount>0x64</cbc:PriceAmount>` passed the page clean, the arithmetic checking out at 100. A receiving access point validates amounts as `xs:decimal` and rejects that file. The Python tool flagged it. The page now says the amount is not a number.
- **One bad amount in a UBL file crashed the CLI.** Python's `Decimal("abc")` raises `InvalidOperation`. That is an `ArithmeticError`, not the `ValueError` the reader catches. Run over a folder, one such file stopped the whole batch with a traceback. Now it is listed as an unreadable file and the others are still checked.
- **A gross of `inf` or `nan` crashed the credit-note linker.** The check that matches credit notes to their invoices turned the gross into cents with `int()`, and `int(float("inf"))` raises. Again the whole folder run died.
- **A quantity of `1e27` crashed the checker.** Python's `Decimal` works to 28 significant digits by default. Rounding a huge line total to cents needs more, so it raised. The browser gave an answer instead, though not a meaningful one.

All four come from one cause: each side read numbers its own way, in fifteen places across the two. Both now share one rule, `numbers.mjs` and `numbers.py`. An amount is an optional sign, ASCII digits, an optional decimal point and an optional exponent, with magnitude under 10^15. Above that a browser's double can't hold the amount to the cent. Python's `Decimal` also accepted `1_000` and Arabic-Indic digits, which the browser rejected. Both sides now reject them.

The same run seeded 16 small faults into the report and UBL reader code and counted how many the test suite caught. Two of the ones that got through were in the route for the official PINT and ZATCA rules. Those tests need two npm packages that no CI job installs, so 45 such tests have always been skipped in CI. Adding the install step is a CI change that needs the owner's approval, so it is written up for its own pull request.

The checker reports what a file contains. It doesn't tell you whether a tax authority will accept the invoice. The test cases are in `ventures/einvoice-preflight/numbers.test.mjs` and `tests/test_numbers.py`.

---
title: "A dollar sign before the minus turned a futures loss into a gain"
seo_title: "Section 1256 calculator read $-1,200 as a gain: parsing fix"
date: 2026-11-12
description: "Our 60/40 futures tax calculator read $-1,200 as +1,200 and 1.5E+04 as 1.5. A red-team run fixed the parser and the same bug in the wash-sale checker."
tags: [redteam, section-1256-futures-tax-calculator, wash-sale-checker, parsing, testing]
---

The [Section 1256 calculator](/ventures/section-1256-futures-tax-calculator/) takes Form 1099-B boxes 8, 9 and 10 for each account and works out the 60/40 split. Today's red-team run seeded 24 faults into its code. Its tests caught 20, a catch rate of 83%. The four that got through were all in error handling. No test checked the message you get when no row can be read, and no test pasted a row with only an account and box 8.

The faults we planted were the smaller problem. The bigger one was in how the calculator read an amount. It found the sign by looking at the first character, then deleted everything that was not a digit or a dot. That meant:

| You type | It read | Now |
|---|---|---|
| `$-1200` | +1,200 | −1,200 |
| `USD -500` | +500 | −500 |
| `1.5E+04` | 1.5 | 15,000 |
| `1e3` | 13 | 1,000 |
| `12-34` | 1,234 | row refused |
| `1.2.3` | 1.2 | row refused |

The first row matters most. A spreadsheet or broker export that writes the currency sign before the minus turned a loss into a gain with no warning, so the page showed a tax bill on money the trader had lost. The parser now accepts only one whole number per field. It reads a minus after `$` or `USD`, a trailing minus, brackets and E notation. Anything else ("12-34", "5 6") is refused with the row number, not stitched into a different number.

The rate fields had two smaller problems. A negative rate, or one over 100, gave a negative tax figure. Now it gets an error. And a long-term rate above the ordinary rate printed "saves about -$30.00". That combination never happens in a federal bracket, but people do type it: the 0% long-term bracket covers the same incomes as the 10% ordinary one. The page now says 60/40 costs more at those rates and asks you to check them.

The [wash-sale checker](/ventures/wash-sale-checker/) had a copy of the same parser. It takes the absolute value of every quantity and price, so the sign bug did no harm there. The E-notation bug did: a quantity of `1e3` became 13 shares. It got the same fix and a test.

Both suites now have a test for every escaped fault. Re-running the four escapes against the new tests caught all of them, so the catch rate went from 83% to 100%. The calculator is still a planning tool, not tax advice. The run record is `prompts/runs/2026-11-12-session_01AcxTtLTzXqEGdpixYVUsj4.json`.

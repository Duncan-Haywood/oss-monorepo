---
title: "Six test suites were red before we touched them"
date: 2026-10-25
description: "A red-team run found a favicon data: URI tripping link checks in six ventures, and 4 of 8 seeded bugs in the prop-firm calculator slipping past its tests."
tags: [redteam, testing, prop-firm-challenge-calculator]
---

A red-team run seeds small bugs into a file and counts how many its tests
catch. Before it could start on the
[prop-firm challenge calculator](../../ventures/prop-firm-challenge-calculator/),
the baseline was already red: the page test treated the inline `data:` favicon
as a file link and failed on "broken internal link". Four sibling ventures
shared the regex and one more (portable-restroom) tripped the same favicon in
an external-reference check. Both were test bugs, fixed in one token each.

Then the campaign: 3 of 8 seeded bugs were caught. The escapes were an
unchecked 100% profit-target bound, a 50-trades-per-day cap, a drawdown
divisor, and a win-rate scaling in the funded phase that no test exercised.
Four new tests close them (one mutant, `ev(101)` for `ev(100)`, is equivalent:
a win probability above 1 behaves like 1). Catch rate on the file went from
42.9% to 100%.

---
title: "The 3.8% investment tax and itemising: two things a freelancer's estimate usually misses"
date: 2026-10-28
description: "ai-bookkeeper's federal estimate now takes an itemised total and net investment income, so a high earner's quarterly plan includes Form 8960's 3.8%."
tags: [ai-bookkeeper, tax, self-employed]
---

# The 3.8% investment tax and itemising

*Written by an AI agent working in this repository. A worksheet, not tax advice.*

A freelancer whose income crosses $200,000 (single) or $250,000 (joint) also owes
a 3.8% net investment income tax on the smaller of their investment income and the
AGI above that line. The line is set by statute and is not indexed, so more people
cross it each year. Quarterly estimates that ignore it come up short.

`node cli.mjs --books books.json estimate` now takes two more flags:

- `--investment $`: the part of `--other` that is interest, dividends, gains or
  passive rent. Example: $250,000 wages plus $50,000 of dividends is AGI of about
  $300,000, so the tax is 3.8% of $50,000, or $1,900.
- `--itemized $`: your Schedule A total, used when it beats the standard deduction.

Both are in the tested function (`estimatedtax.test.mjs`, 37 pass with the
property tests) and the README. State tax and most credits are still out.

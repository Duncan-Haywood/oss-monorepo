---
title: "Four of our tax tools had the same $25 slip, and their own tests could not see it"
seo_title: "2026 head of household 24% bracket: $201,750, not $201,775"
date: 2026-11-14
tags: [ventures, tax, testing, irs]
description: "Four calculators gave head-of-household filers the single filer's 24% bracket edge. A script checking our IRS table copies against the IRS text found it."
---

For 2026 the 24% bracket for a head of household ends at **$201,750** of taxable income. For a single filer it ends at **$201,775**. The two numbers are $25 apart, and both are in [Rev. Proc. 2025-32](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf), section 4.01, Tables 2 and 3.

Four of our calculators had $201,775 in both rows:

- [inherited IRA 10-year withdrawal planner](../../ventures/inherited-ira-10-year-withdrawal-planner/)
- [locum tenens vs employed calculator](../../ventures/locum-tenens-vs-employed-calculator/)
- [Roth conversion bracket-fill calculator](../../ventures/roth-conversion-bracket-fill-calculator/)
- [RSU withholding gap calculator](../../ventures/rsu-withholding-gap-calculator/)

The other five figures in each head-of-household row were right. The single filer's row sits on the line just above, so this looks like a copy across one line that then went from tool to tool.

## What it changed

Not much money. From $201,750 to $201,775 of taxable income, a head of household's tax was worked out at 24% instead of 32%. That made the estimate up to $2 too low, and it stayed $2 too low at every income above that. The Roth tool, asked to "fill the 24% bracket", told a head of household to convert $25 more than fits, and that $25 is taxed at 32%. None of this would change anyone's decision. It is still wrong, and we say each figure comes from the IRS text.

## Why the tests missed it

Each tool's tests were written from the tool's own table, so they agreed with it. A test that says "this taxable income gives this tax" proves nothing about the table if the expected number was computed from the same table. Only a copy of the IRS text checks it.

## The check

[`platform/ci/check_irs_table_figures.py`](../../platform/ci/check_irs_table_figures.py) holds the 2026 tables (brackets for all five filing statuses, the capital-gains 0% and 15% breakpoints, the standard deductions) and the 2025 brackets and breakpoints from Rev. Proc. 2024-40. Every figure was read from the IRS PDFs with `pdftotext` on 2026-11-14. It reads every shipped venture file and works like this:

1. A table counts as present in a file when more than half its figures appear there (as `201,750`, `201_750`, `201750` or cents).
2. Any figure of a present table that is missing, with a number within 0.5% of it in the file, is reported as a likely typo.
3. If that near number is itself a figure from another IRS table, the report says the row was probably copied from that table.

The "more than half" rule matters. The single and head-of-household tables share up to three of their six figures. Without it, every file holding only a single filer's table would read as a broken head-of-household one.

On today's tree it reported exactly these four files and nothing else. Eighteen ventures hold at least one complete table, and there are 14 complete copies each of the 2026 single and joint tables. After the fix it reports nothing. The 2025 tables are clean too.

## The fix

We changed one number in each `calc.mjs`. Each tool also gets an `irs-table.test.mjs`, with the tax at every bracket edge typed in from the IRS text: for a head of household, $39,207 at $201,750 and $56,631 at $256,200. Putting $201,775 back makes that test fail by $2. The expected numbers come from the IRS, not from the code under test, so the test now checks something.

This only catches near misses in copies that are mostly right. A table that is wrong all through, like an old year's figures labelled 2026, is a different problem. [`tax_year_staleness.py`](../../platform/ci/tax_year_staleness.py) looks for that.

*These calculators give estimates, not tax advice. Check the figures against the IRS text or with a tax professional before you file.*

---
title: "Checking every cell of the IRS's earned income credit table, and the bug it turned up"
seo_title: "The 2025 EIC Table, checked cell by cell"
date: 2026-11-11
description: "The ai-bookkeeper now matches all 10,992 cells of the 2025 EIC Table, and the IRS worksheet exposed an undercount for low earners with other income."
tags: [ai-bookkeeper, tax, verification, earned-income-credit]
---

The ai-bookkeeper's tax estimate has had an earned income credit since late October. Its figures came from the IRS's summary page and Rev. Proc. 2025-32: the maximum credits, where the credit ends, and the investment-income limit. A test pinned those. What nobody had checked was the table people actually use. The credit on a real return isn't worked out from the formula. You look it up in the Earned Income Credit Table at the back of the Form 1040 instructions, in $50 bands. Until today, irs.gov kept answering this sandbox with a 403. Today it answered.

## The table

The 2025 table runs over twelve pages: 1,374 rows from $1 to $68,700, each with eight columns (zero to three children, for single and for joint filers). That makes 10,992 printed credits, plus eight footnotes for the last band in a column, where the credit runs out partway through. All of it now sits in the repository as a fixture, read straight from the PDF's text layer. The rows run on with no gaps, and the instructions' own worked example ($2,455, single, one child: $842) is in it.

The engine already had a table mode that worked out the credit at each band's midpoint. It didn't match. One rule does reproduce every cell:

- the credit at the band's midpoint, **rounded to the dollar** (the old mode kept cents: $384.41 where the table prints $384);
- the band that holds the earned-income amount prints the maximum credit, though its midpoint is a little short of it;
- the phase-out begins only with the first band that starts at or above the phase-out start. For a joint filer with three children the start is $30,470, so the $30,450 to $30,500 band still prints the full $8,046;
- the last band ends where the credit runs out (the start plus the maximum over the phase-out rate, to the dollar). Nothing is printed past that.

With those four, all 10,992 cells match. The test looks up the bottom, middle and top of every band in cents, more than 60,000 lookups.

## The bug the worksheet showed

The table is only half of Worksheet A. You look up your earned income. If your AGI is different and has reached the phase-out start, you look that up too, and the credit is the **smaller** of the two lookups. The statute, 26 U.S.C. 32(a)(2), says the same thing: the phase-out comes off the *maximum* credit.

The old code took the phase-out off the *phase-in* credit instead. For most filers, whose AGI is close to their earnings, the two give the same answer. They part ways for someone with low earnings and a lot of other income, such as unemployment pay, a pension or alimony (investment income over $11,950 rules the credit out anyway). Take a single parent with one child, $5,000 of wages and $25,000 of other income. The old estimate gave a credit of about $637. The table gives $1,709, and so does the engine now. That is a $1,072 understatement in a refundable credit, for the very households the credit exists for.

## What changed

- `eicTableCredit` in `estimatedtax.mjs` is the table, as a function. `estimate --eitc-table` and the page (where table mode is now on, because both IRS worksheets use the table) follow Worksheet A.
- The exact mode (no `--eitc-table`) uses the statute's formula. On wages alone it comes within $1 of every printed cell except the two per column where the table rounds up to the maximum, which it misses by up to $2.25.
- The 2026 table isn't printed yet; it normally comes out with the instructions around the turn of the year. The same rule on the 2026 figures is the expected result. When the new table appears, checking it means running the same parser on it.

What it still assumes: that the qualifying-child, age, residency and Social Security number tests are met. The estimate says so every time. It is an estimate, not tax advice.

The code, the fixture and the tests are in `ventures/ai-bookkeeper/` (MIT).

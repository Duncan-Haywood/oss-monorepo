---
title: "The earned income credit now ships with the IRS's own numbers"
date: 2026-10-28
description: "The AI bookkeeper estimate now has a built-in 2025 earned income credit that reproduces the IRS maximum credits and income limits."
tags: [ai-bookkeeper, tax, self-employed]
---

The AI bookkeeper's tax estimate could already take an earned income credit, but only from a file you typed yourself. Today the IRS website answered, so 2025 is built in.

The IRS publishes four things for each year: the largest credit for 0, 1, 2 and 3 children ($649, $4,328, $7,152, $8,046 for 2025), the income at which the credit ends, and the investment-income cap ($11,950). We checked that the fixed statutory rates and the indexed income amounts reproduce all of them, single and joint. A test now pins every figure.

Use it with `estimate --year 2025 --eitc-children 2`. Other years still need a tax-table file until the IRS publishes them. It assumes you meet the credit's child, age and residency tests, and says so.

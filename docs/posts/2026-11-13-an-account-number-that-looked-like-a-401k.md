---
title: "An account number that looked like a 401(k)"
seo_title: "Wash sale checker bug: account numbers with 401 were read as IRAs"
date: 2026-11-13
description: "The wash sale checker treated any account number containing 401 as a retirement account and dropped those sales without a word. Now it matches whole words."
tags: [redteam, wash-sale-checker, tax, testing]
---

The [wash sale checker](/ventures/wash-sale-checker/) reads a list of trades and works out which losses are disallowed under IRC 1091. If a file has an `Account` column, the tool checks whether each row is in a retirement account. That matters in two ways. A loss sale inside an IRA has nothing to deduct, so the tool skips it. And a loss washed by a repurchase inside an IRA is lost permanently (Rev. Rul. 2008-5) instead of being deferred into the new shares' basis.

The check was `/ira|roth|401|403|sep|retire|hsa/i` run against the account text. It had no word boundaries, so all of these counted as retirement accounts:

- `Individual Z40123456`, because the number contains `401`
- `Brokerage 4403-1234`, because it contains `403`
- `September Growth`, because it starts with `sep`
- `Mirage Joint`, because it contains `ira`

For a file like that, the tool skipped every sale. The summary read "0 sales checked" and gave one note per row about IRA sales, while the real losses never appeared. Brokers often put the account number in this column, so the bug would not have been rare.

The check now accepts those words only as whole tokens. Underscores and hyphens count as separators, so `ROTH_IRA` and `SEP-IRA` still match, as do `401(k)`, `Company 401k` and `403(b) plan`.

## How it was found

This was a red-team run: [`prompts/redteam.py`](https://github.com/duncan-haywood/oss-monorepo/blob/main/prompts/redteam.py) seeds small faults into one file and checks whether the existing tests notice. The suite caught 7 of the 12 seeded faults. One fault that got through changed `c.acct >= 0` to `c.acct > 0`. No test put the Account column first, so reading that code again pointed straight at the regex below it.

The same reading turned up two more defects:

- **The downloadable report broke on a symbol with a comma.** A broker row with the quoted symbol `"BRK,B"` came out unquoted, so every later column of that row moved one place to the right. A symbol starting with `=` was written as a live spreadsheet formula. The file was on the repository's [CSV formula-guard](https://github.com/duncan-haywood/oss-monorepo/blob/main/platform/ci/check_csv_formula_guard.py) baseline of unguarded exporters. Cells are now quoted and defused, and the baseline is one file shorter (509).
- **A three-digit year was accepted.** A row dated `1/2/202` was read as 2 January 202 AD. It sorted 1,800 years before everything else and could never fall inside a wash window. Now the tool refuses that row and names the line.

Of the other faults that got through, two needed new tests: the Account-column position, and keeping two same-day sales in file order so that first-in-first-out lots go to the earlier line. The remaining three can't change any output. With the new tests, the suite catches every seeded fault that could change a result.

The tool runs entirely in your browser, and it is a planning aid, not tax advice.

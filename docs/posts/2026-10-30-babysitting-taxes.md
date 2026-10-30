---
title: "A babysitter's real federal tax, next to the amount to save"
date: 2026-10-30
tags: [babysitting-business-kit, taxes, self-employment, estimated-tax]
description: "On $20,000 of babysitting profit a single filer with no other income owes about $3,025 in federal tax, about 60% of the kit's conservative federal set-aside. The new estimate, the safe-harbor plan and a Schedule C worksheet."
---

The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) already told a sitter how much to move into savings: self-employment tax plus their bracket rate on the whole profit, plus a state rate. That number errs high on purpose, because it ignores the standard deduction. It is a good amount to save. It is a poor guess at the bill.

The Money & taxes tab now shows a real federal estimate beside it, using the 2026 brackets and standard deductions (Rev. Proc. 2025-32, copied with attribution from the kit's sibling, the AI bookkeeper, which checked them against the IRS text). It covers self-employment tax, the deduction for half of it, the 20% qualified business income deduction (and the $400 minimum that starts in 2026), and, if you enter them, W-2 wages and withholding. You pick single, head of household or married filing jointly.

## What the numbers look like

These are from the kit's tests and a short script, for 2026, with babysitting profit as the only change:

| Babysitting profit | Filer | Other wages | SE tax | Income tax | Federal total | Conservative federal set-aside |
|---|---|---|---|---|---|---|
| $5,000 | single | none | $706 | $0 | $706 | $1,264 |
| $20,000 | single | none | $2,826 | $199 | $3,025 | $5,056 |
| $20,000 | head of household | none | $2,826 | $0 | $2,826 | $5,056 |
| $30,000 | single | none | $4,239 | $942 | $5,181 | $7,585 |
| $20,000 | single | $25,000 | $2,826 | $2,604 | $5,430 | $5,056 |

For someone whose only income is babysitting, self-employment tax is most of the bill. The $16,100 standard deduction swallows most of the income tax. The last row shows the opposite case. With a day job, babysitting is taxed from the first dollar at that job's bracket. The income tax there also covers the wages, which the job's withholding pays, so enter what is withheld, and the "still to pay" figure nets it out.

The estimate leaves out credits (child tax credit, earned income credit) and itemized deductions. A parent who babysits will usually owe less than it says, and the page says so.

## Safe harbor: what you actually have to pay each quarter

The underpayment penalty is avoided by paying, in four equal parts, the smaller of 90% of this year's tax or 100% of last year's (110% if last year's AGI was over $150,000). Withholding counts as if it were paid evenly through the year. Enter last year's total tax and the plan compares the two. With $20,000 of profit this year and $2,000 of tax last year, the requirement is $2,000, or $500 a quarter, against $2,722 for 90% of this year. Record each payment as you send it. A missed quarter shows as "short" and rolls into the next payment. If tax after withholding is under $1,000, or last year's tax was $0, the plan says no payments are required.

Babysitting income is seasonal. The annualized installment method (Form 2210, Schedule AI) can lower early payments for a sitter who earns most of it in summer. The plan does not model that, and it says so.

## Schedule C, ready for a preparer

Payments received go to line 1. Mileage at the standard rate goes to line 9, with the business miles for Part IV. Advertising goes to line 8, liability insurance to 15, supplies to 22 and the phone to 25. Training and fees are listed by name under Part V, line 27a. Any category the kit does not know also falls to 27a. "Download Schedule C worksheet" gives a CSV with those lines and every receipt behind them. Cells that start with `=` are escaped so a spreadsheet will not run them. "Print year summary" prints one page with the lines, the estimate, the set-aside and the quarterly plan.

13 new tests cover the brackets, the SE wage base, filing status, the QBI minimum and threshold, the safe harbor's 100%/110%/90% choice, a missed quarter, and the CSV. The venture's suite is 56 tests. It is a worksheet, not a return: check it with a preparer before you file.

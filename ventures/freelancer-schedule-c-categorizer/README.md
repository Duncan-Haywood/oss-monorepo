# Freelancer Schedule C Categorizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/freelancer-schedule-c-categorizer/>

A free browser tool for freelancers and sole proprietors: **drop in your bank or card CSV and get
every transaction sorted into an IRS Schedule C line.** The file is read in the browser; nothing is
uploaded and no bank login is needed.

After using this, you can now **see gross receipts and each expense line, which transactions could
not be categorised, which deposits are net of payment-platform fees, which purchases may be
equipment, and download every row with its category and the rule that decided it**, which used to
mean sorting a year of bank lines into a spreadsheet by hand or paying for a bookkeeping app with a
bank link.

Related: [`self-employment-tax-calculator`](../self-employment-tax-calculator/),
[`quarterly-estimated-tax-calendar`](../quarterly-estimated-tax-calendar/),
[`home-office-deduction-calculator`](../home-office-deduction-calculator/),
[`1099k-reconciliation-worksheet`](../1099k-reconciliation-worksheet/).

## Input

- A CSV with a date, a description and an amount (or debit and credit) column; an optional business
  column. Money in is positive; a checkbox flips card exports that list charges as positive.
- Optional `keyword => category` rules (yours win over the built-ins), `keyword => business` rules,
  a tax year and an equipment threshold.

## Model

Keyword rules put deposits on line 1 and expenses on lines 8 to 27a. Meals count at 50% on line
24b. Held out, not deducted: owner draws and personal spending, transfers (also paired
automatically), estimated-tax payments, sales tax, loan and card principal, health insurance and
retirement contributions (Schedule 1), bank interest, and equipment. Payment-platform payouts are
**flagged**, because they are net of fees while line 1 is gross; equipment over the threshold is
**flagged, never decided**. Not modelled: depreciation, home office, standard mileage, business-use
percentages, cost of goods sold, payroll, self-employment tax, QBI, state rules. Column names are
matched by alias and **unverified against real bank exports**. Not tax advice.

## Run

Open `index.html` through any static server. Tests: `node --test`.

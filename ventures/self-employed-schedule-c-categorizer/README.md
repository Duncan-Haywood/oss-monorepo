# Self-Employed Schedule C Categorizer

A free browser tool for freelancers, sole proprietors and gig workers: **drop in your bank or card
CSV and get every transaction sorted into an IRS Schedule C line.** The file is read in the
browser; nothing is uploaded and no bank login is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/self-employed-schedule-c-categorizer/

After using this, you can now **see gross receipts and each expense line per business, which
transactions could not be categorised, whether your deposits are short of your 1099 gross because
platforms took their fees first, what was held out because it is not a Schedule C expense, and
download every row with its category and the rule that decided it**, which used to mean sorting a
year of bank lines into a spreadsheet by hand.

Related: [`quarterly-estimated-tax-calendar`](../quarterly-estimated-tax-calendar/),
[`1099k-reconciliation-worksheet`](../1099k-reconciliation-worksheet/),
[`mileage-log`](../mileage-log/),
[`rental-property-schedule-e-categorizer`](../rental-property-schedule-e-categorizer/) (the landlord version).

## Input

- A CSV with a date, a description and an amount (or debit and credit) column; an optional
  business column. Money in is positive; a checkbox flips card exports that list charges as
  positive.
- Optional `keyword => business` rules, `keyword => category` rules (yours win over the built-ins),
  a tax year, an equipment limit, and the gross receipts from your 1099s.

## Model

Keyword rules put receipts on line 1 and expenses on lines 8 to 27; meals are shown at 50 percent.
Held out, not deducted: your own estimated-tax payments, health insurance and retirement
contributions (Schedule 1), equipment over the limit, loan principal, transfers (also paired
automatically), owner draws. Equipment-like and personal-looking rows are **flagged, never
decided**. Not modelled: self-employment tax, depreciation, home office, mileage, cost of goods
sold, cash income, sales tax collected. Column names are matched by alias and **unverified against
real bank exports**. Not tax advice.

## Run

Open `index.html` through any static server. Tests: `node --test`.

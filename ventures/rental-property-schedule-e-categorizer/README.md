# Rental Property Schedule E Categorizer

A free browser tool for small landlords: **drop in your bank or card CSV and get every
transaction sorted into an IRS Schedule E, Part I line, per rental property.** The file is read
in the browser; nothing is uploaded and no bank login is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/rental-property-schedule-e-categorizer/

After using this, you can now **see rents and each expense line per property, which
transactions could not be categorised, which repairs may really be improvements, which months
have no rent deposit, and download every row with its category and the rule that decided it**,
which used to mean sorting a year of bank lines into a spreadsheet by hand.

Related: [`rent-roll-delinquency-analyzer`](../rent-roll-delinquency-analyzer/) (who paid late),
[`bonus-depreciation-calculator`](../bonus-depreciation-calculator/),
[`depreciation-recapture-calculator`](../depreciation-recapture-calculator/).

## Input

- A CSV with a date, a description and an amount (or debit and credit) column; an optional
  property column. Money in is positive; a checkbox flips card exports that list charges as
  positive.
- Optional `keyword => property` rules, `keyword => category` rules (yours win over the
  built-ins), a tax year, a repair threshold, and the year's mortgage interest per property from
  Form 1098.

## Model

Keyword rules put rent on line 3 and expenses on lines 5 to 19. Held out, not deducted: mortgage
payments (until interest is typed), capital improvements, transfers (also paired automatically),
security deposits, owner draws. Repair-like items over the threshold or worded like a replacement
are **flagged, never decided**. Not modelled: depreciation, partial-year or personal use, shared
costs, cash paid, 1099 differences, passive-loss and QBI rules. Column names are matched by alias
and **unverified against real bank exports**. Not tax advice.

## Run

Open `index.html` through any static server. Tests: `node --test`.

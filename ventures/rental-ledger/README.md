# Rental Ledger

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/rental-ledger/>

After using this, you have a Schedule E for each rental, with depreciation worked out, the rental-loss allowance applied, and the contractors who need a 1099-NEC listed, from a year of rent and expense rows that used to sit in a spreadsheet.

Free, no account, no watermark, works offline. Everything runs in your browser; your data is stored in `localStorage` on your device and never uploaded.

- Properties with purchase price, closing costs, land value, date placed in service and ownership share
- Entries: rent, security deposit (kept out of income), expense (by Schedule E line), improvement (depreciated from its own date), loan principal (cash flow only)
- Schedule E Part I by property: rents, lines 5-19, depreciation (line 18), total expenses, income or loss
- Depreciation: 27.5-year straight line, mid-month convention; the parts add up to the basis exactly
- Rental loss rules: $25,000 special allowance for active participation, 50% phase-out from $100,000 to $150,000 MAGI, suspended losses carried in and out
- Rent collection by month against target rent, vacancy, and short months
- Flags: large "repairs" that look like improvements, the $2,500 de minimis safe harbor, deposits, missing land value or in-service date, orphaned or undated rows
- Sale of a property: depreciation recaptured at up to 25%, long-term gain at 0/15/20% stacked on your income, the 3.8% investment income tax, suspended losses released, ordinary loss on a sale at a loss, cash in hand after payoff and tax
- 1099-NEC list at the $2,000 threshold, by payee
- CSV import (rows that cannot be read are listed with the reason), formula-safe CSV export of Schedule E and of all entries, JSON backup, storage protection and backup-age line
- Money in whole cents (`calc.mjs`), no model

Run the tests: `node --test`. Serve `index.html` from any static host.

Sibling of [Schedule E Categorizer](../rental-property-schedule-e-categorizer/), [Rent Roll Delinquency Analyzer](../rent-roll-delinquency-analyzer/), [Repair or Replace Planner](../landlord-repair-or-replace-planner/), [Rental DSCR Calculator](../rental-dscr-calculator/) and [Renewal Rent Optimizer](../renewal-rent-optimizer/).

Not legal, tax or financial advice; see the disclaimer on the page. MIT licensed.

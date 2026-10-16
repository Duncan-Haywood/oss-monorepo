# Turo Earnings Report Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/turo-earnings-report-analyzer/>

A free browser tool for Turo hosts: **drop in your earnings or trip history CSV and see
which cars actually make money.** The file is read in the browser; nothing is uploaded
and no Turo account access is needed.

After using this, you can now **see profit per car and per trip after Turo's fee, your
cleaning, fuel and delivery costs, and each car's monthly loan, insurance and
depreciation, with utilization, revenue per rented day, net per day, break-even
utilization and the cars that lose money**, which used to mean building the pivot table
by hand or trusting the payout total alone.

## Input

Any CSV with a `Trip start` (or `Start date`) and an amount: `Earnings` (what Turo paid
you) and/or `Trip price`. `Vehicle` (or `Year`/`Make`/`Model`), `Trip end`, `Trip days`,
`Status`, `Turo fee`, and `Cleaning cost` / `Fuel cost` / `Delivery cost` are used when
present. **Column names are matched by alias from memory of Turo exports; no real
export was available.** Comma/tab/semicolon files, quoted fields, US and day-first
dates and UTF-16 exports are read. Unreadable rows are listed with a line number and
reason.

## Model

Paid to you is Turo's payout; the fee is read from a fee column, or price minus
earnings, or the percentage you enter when the file has only a price. Per-trip costs come
from the file or your defaults. Fixed costs are monthly loan, insurance and depreciation
per car times the months in the period. Utilization is rented days over days in the
period. Cancelled trips with no payout are dropped and counted; with a payout they are
revenue with no days or costs. See the page for what is not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.

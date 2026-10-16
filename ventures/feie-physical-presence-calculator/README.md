# FEIE Physical Presence Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/feie-physical-presence-calculator/>

**Enter your stays abroad and see your best 12-month window, how many of the 330 full days you have, how many days you can still spend elsewhere, the first date you reach 330, and the prorated foreign earned income exclusion.** Browser page, no install.

After using this, you know whether you meet the Form 2555 physical presence test on your own dates and how much slack a trip home leaves, which used to take a spreadsheet of date arithmetic.

## Your dates, not tax advice

Every value is something you type. Count only full 24-hour days in a foreign country. The calculator does not decide whether you have a tax home abroad, what is earned income, or whether to elect the exclusion. The limit table (2023-2026) is editable; check the current IRS figure. Not affiliated with the IRS or any tax preparer.

## How it computes

Stays are merged into a day set. A 12-month window (start date to the day before the same date a year later) is slid across every start date; the window with the most foreign days is reported, and it qualifies at 330 or more. The first date a window holds 330 days is the earliest qualifying date. The prorated limit is the annual limit times the days of the tax year that fall in some qualifying window, divided by the days in the year; the exclusion is the lesser of that and your foreign earned income.

## What it is not

Not tax, legal or immigration advice, and no warranty. It does not model the bona fide residence test, housing exclusion, or state taxes.

## Privacy

No network call, no account, no analytics vendor. Anonymous feature counts (`count_run`, `example_loaded`) live in local storage only and can be switched off on the page; Do Not Track and Global Privacy Control are honoured.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

# FEIE Physical Presence Calculator

**Enter your stays abroad and see your best 12-month window, how many of the 330 full days you have, how many days you can still spend elsewhere, the first date you reach 330, and the prorated foreign earned income exclusion.** Browser page, no install.

**Live tool:** https://marisstella.app/feie-physical-presence-calculator/

After using this, you know whether you meet the Form 2555 physical presence test on your own dates and how much slack a trip home leaves, which used to take a spreadsheet of date arithmetic.

## Your dates, not tax advice

Every value is something you type. Count only full 24-hour days in a foreign country. The calculator does not decide whether you have a tax home abroad, what is earned income, or whether to elect the exclusion. The limit table (2023-2026) is editable; check the current IRS figure. Not affiliated with the IRS or any tax preparer.

## How it computes

Stays are merged into a day set. A 12-month window (start date to the day before the same date a year later) is slid across every start date; the window with the most foreign days is reported, and it qualifies at 330 or more. The first date a window holds 330 days is the earliest qualifying date. The prorated limit is the annual limit times the days of the tax year that fall in the single qualifying window covering the most of that year, divided by the days in the year; the exclusion is the lesser of that and your foreign earned income.

## Known gaps

From the [2026-11-17 quality audit](../../portfolio/quality/audits/2026-11-17-feie-physical-presence-calculator.json):

- The prorated limit counts every day of the chosen 12-month period, which can run up to 35 days before your first stay or after your last. Those days count only while your tax home was abroad; the result now says so, but it does not ask.
- Not modelled: the war and civil-unrest waiver of the 330-day minimum, and the rule that only pay for work done abroad during the qualifying period is excludable.

## What it is not

Not tax, legal or immigration advice, and no warranty. It does not model the bona fide residence test, housing exclusion, or state taxes.

## Privacy

No network call, no account, no analytics vendor. Anonymous feature counts (`count_run`, `example_loaded`) live in local storage only and can be switched off on the page; Do Not Track and Global Privacy Control are honoured.

## Licence

FSL-1.1-MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

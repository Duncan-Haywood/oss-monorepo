---
title: "We read 26 state tax pages. Hawaii's annual return is in April, and Iowa dropped prepayments in 2022"
seo_title: "State sales tax due dates checked against 26 state pages"
date: 2026-11-12
tags: [ai-bookkeeper, ventures]
description: "Sales tax due-date presets from guides, checked against 26 states' own pages: two were wrong, and several states don't offer the frequencies people ask for."
---

[AI Bookkeeper](https://marisstella.app/ai-bookkeeper/) builds a sales tax worksheet and a [tax calendar](https://marisstella.app/ai-bookkeeper/tax-calendar.html) with each state's return dates. Most of those dates came from search excerpts and third-party guides, because the state tax sites usually refused our build container's connection. Today 26 of them answered. So we read each one's own page, guide, calendar or form instructions in full, saved the text, and checked every sentence we relied on against the saved copy.

## Two presets were wrong

**Hawaii's annual return.** We had Hawaii as "the 20th of the month after the period", which puts an annual return on January 20. The Department of Taxation's general excise tax page says monthly, quarterly and semiannual returns are due the 20th after the period. Then it says: "The due date is the 20th day of the fourth month following the close of the taxable year. For calendar year filers, the due date is April 20th of the following year." A calendar that says January is three months early. That costs nothing in penalties, but it's wrong, and a reader would rightly stop trusting the rest of the list.

**Iowa's prepayments.** The tool told Iowa filers that large sellers make semi-monthly prepayments. That came from secondary guides. Iowa's own page on the 2022 changes says they "eliminate the semimonthly remittance", effective July 1, 2022. Iowa sales tax is now annual (under $1,200 of tax a year, due January 31) or monthly (the last day of the next month). The guides had probably mixed in Iowa's withholding table, which sits on the same page and does have quarterly and semimonthly rows.

## Several states don't offer what people ask for

The calendar used to give dates for any frequency you picked. Pick "quarterly" for Oklahoma and you got four tidy April, July, October and January dates. But Oklahoma's help centre names only monthly filing and semiannual filing, the second for sellers whose tax doesn't exceed $50 a month. New Mexico lists monthly, quarterly and semiannual (by application, at $500 a month or less), but not annual. Indiana lists monthly, plus annual under $1,000 a year.

So each state we read now records the frequencies its page names. Ask for one it doesn't list and you still get the dates, with a note naming the ones it does and a link to the page. We didn't refuse outright because a state can assign a filer something its summary page leaves out. The note says to go by your own notice.

## Small print worth knowing

- **Arizona's grace period doesn't stop penalties.** An electronic return is timely if it arrives by the last business day of the month, and a paper one by the second-to-last. But azdor.gov says penalties and interest "accrue from the statutory due date of the 20th and not from the last date of the grace period."
- **Kentucky's accelerated filers** are due the 25th, not the 20th.
- **Wisconsin's early monthly filers** are due the 20th, not month end.
- **Every Michigan filer** also files an annual return by February 28, whatever their frequency.
- **The weekend rule held** where we could check it. Vermont's own 2026 table has Q1 due April 27 because April 25 is a Saturday. North Dakota's calendar moves January 31, 2026 to February 2. The calendar already did both.

## What we couldn't read

Indiana's handbook and form instructions name the frequencies but never print the day of the month for sales tax. The 20th/30th table in the handbook is for withholding. So Indiana keeps the 30th, with a note to use the date on the INTIME return. Maryland's page only renders through JavaScript, Nevada's sits behind a bot check, and New Jersey's pages had no due-date text we could find. Utah, Tennessee, Arkansas, Rhode Island, Colorado, Maine, Massachusetts and Ohio refused the connection outright.

The tax calendar now shows, under the form, either the state page its dates were checked against or "not yet checked". That's more honest than a single line saying "some of these were checked". The list of sources is `STATE_SOURCES` in `salestaxreturn.mjs`. The README has the details, and the tests pin each date we read.

These are dates to plan from, not tax advice. Your state's notice decides your real due date.

---
title: "Quality fix: a Texas lien notice is due every month, not once"
date: 2026-11-16
tags: [quality-audit, construction, legal-tools]
description: "The mechanics lien calculator showed one Texas notice date for a four-month job. It now lists one per month, and asks who hired you for Georgia."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
The queue had no open high-severity defects, so it took two the first audit of the
[Mechanics Lien Deadline Calculator](https://marisstella.app/mechanics-lien-deadline-calculator/)
left open on 2026-11-07 ([audit file](../../portfolio/quality/audits/2026-11-07-mechanics-lien-deadline-calculator.json),
defects 4 and 5). The earlier fix (PR #15903) had only dealt with the page copy.

## What was wrong

**Texas showed one notice date.** In Texas a subcontractor or supplier sends a
notice for *each month* of unpaid work, due the 15th day of the 3rd month after
that month on commercial jobs (2nd month on residential). The calculator showed
the date for the first month only, with a line saying later months "have later
dates". So a subcontractor who worked March to June was given June 15 and had to
work out July 15, August 15 and September 15 for themselves. Those three are the
dates people miss.

**The Texas notice had its old name.** The tool called it a "notice of unpaid
balance". Since the 2021 amendments (HB 2237, for original contracts signed on
or after 1 January 2022) the statutory form is a *notice of claim for unpaid
labor or materials*.

**"First-tier only" hid the one state where the tier matters.** The audit said
second-tier claimants (hired by a subcontractor, or supplying one) got a
too-late answer. We checked each of the seven states. For six, the notice and
lien clocks are the same for both tiers, and Texas too for contracts from 2022
(HB 2237 dropped the second-tier 2nd-month notice). Georgia is different, but
the opposite way from the audit's guess: its Notice to Contractor is required
only from claimants *without* a contract with the general contractor. The tool
was telling first-tier Georgia subcontractors to send a notice the statute does
not ask of them.

## What changed

- Texas results now include a **monthly notice schedule**: one row per month
  from first to last furnishing, each with its date, a weekend-adjusted safe date
  and days left. A finding counts how many have passed and names the earliest
  still open. It stops at 36 months and says so.
- A **"Who hired you"** input. In Georgia a first-tier claimant sees "not
  required of you" and keeps the 90-day lien date. A second-tier claimant gets
  the 30-day notice, plus the caveat that no notice is needed where no notice of
  commencement was filed.
- Texas results state the 2022 contract-date limit and that retainage has its
  own dates, which the tool does not show.
- 12 new tests. They pin the March to June schedule (counted by hand), the year
  crossing, the Saturday August 15 safe date, the passed-month count and the
  Georgia tier split, and check that the tier changes nothing in the other six
  states. Two seeded mutations (dropping the last month from the schedule, and
  forcing every claimant to second tier) both failed the suite.

## What is still not at the bar

The 2026-11-16 additions come from law-firm and lien-service summaries found by
search, which agree with each other. The session could not reach the statute
text itself (the Texas, Justia and FindLaw hosts are blocked from the session).
That is the same limit as audit defect 0, which stays open. Third-tier
claimants, laborers' special rules, Texas retainage notices and pre-2022 Texas
contracts are still not modelled, and the README says so. The tool is a date
lookup, not legal advice. A re-audit in a later round will score the change.

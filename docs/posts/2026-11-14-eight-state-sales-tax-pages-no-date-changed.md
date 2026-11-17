---
title: "Eight more state sales tax pages read, and not one due date changed"
seo_title: "Sales tax due dates in eight states, checked on their own pages"
date: 2026-11-14
description: "ai-bookkeeper now checks 34 jurisdictions' sales tax due dates on their own pages. Eight read today all matched; NC and VA list no annual filing."
tags: [ai-bookkeeper, sales-tax, verification]
---

The ai-bookkeeper builds a sales tax worksheet and a calendar of due dates for any US state. Most of its due dates first came from search excerpts, because state tax sites often refuse connections from a cloud build machine. On November 12, 26 of those sites answered. We read each one in full, and that found two real errors: Hawaii's annual return date and Iowa's filing frequencies.

Today eight more answered: Georgia, Illinois, Minnesota, North Carolina, Nevada, South Carolina, Virginia and Washington. We saved each page and copied the sentences we relied on into the venture's `eval/state-pages-2026-11-14.md`.

**Every date already matched.** Some of them are the kind of thing guides get wrong:

- North Carolina's quarterly returns are due on the last day of January, April, July and October, not the 20th like its monthly ones.
- Minnesota's annual return is due February 5.
- Washington's monthly returns are due the 25th, quarterly ones at the end of the following month, and annual ones on April 15.
- Nevada now posts a banner saying returns "are now due on the 20th of the month". That matches the January 2026 change, which the tool had taken from a press release.

An honest null result is still worth recording. Each page's link and the date we read it are now in the code, and the tax calendar links each state's page next to its dates.

**What did change: frequencies the state doesn't offer.** North Carolina and Virginia list monthly and quarterly filing only. Before today, `salestax return --state NC --freq annual` quietly gave a January 31 date for a return North Carolina doesn't have. Now it notes that the state's own page lists monthly and quarterly, links that page and says to use the frequency on your notice. Washington gets the same note for semiannual.

**Georgia's discount, read on the form.** Georgia's vendor's compensation (3% of the first $3,000 of tax on a return, 0.5% of the rest, timely returns only) came from search excerpts in October. Today the Form ST-3 PDF downloaded from dor.georgia.gov, and Part C prints exactly those rates. A 2026 proposal to raise the $3,000 step is still unconfirmed, so the tool doesn't model it.

**Still not read:** Massachusetts, Colorado, Maine, Utah, Arkansas and Rhode Island refused the connection. The pages we tried for Ohio, Maryland, New Jersey, New York, Tennessee and Missouri had moved or showed no due-date text. Indiana's own pages still don't print the day of the month. Those states keep their notes saying where each date came from.

This is a worksheet to check a return against, not tax advice. The date on your own notice is the one that counts.

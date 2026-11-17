---
title: "A retirement planner filed under restaurants"
seo_title: "Giving 53 household tax and retirement calculators their own section"
date: 2026-11-17
tags: [polish, seo, platform]
description: "53 US household tax, pay and retirement tools were split across four business categories. They now have one section, one page and a correct breadcrumb."
---

Until today, the first link on the [Retirement Withdrawal Sequencer](https://marisstella.app/retirement-withdrawal-sequencer/)
read **Restaurant, bar & food truck pricing**. That link is the breadcrumb under the site header, and
the page's `BreadcrumbList` markup said the same thing, so a search result could show it too. The
[RMD calculator](https://marisstella.app/rmd-calculator/) said **Back-office money & contracts**. The
[nanny tax calculator](https://marisstella.app/nanny-tax-calculator/) said **Service business pricing
& quotes**, beside dog-grooming and pool-route quotes.

## How it happened

The site groups its tools into sections, and each section has an offline bundle with a size limit.
When the back-office bundle got close to its limit in October, new tools were filed wherever there
was room, with a comment saying why. Household tax and retirement tools kept arriving, so they
ended up in four places:

| Was in | Tools |
|---|---|
| Back-office money & contracts | 34 |
| Service business pricing & quotes | 11 |
| Creator & solo earner income | 7 |
| Restaurant, bar & food truck pricing | 1 |

Each placement made sense on the day it was made. Taken together, a retiree, an employee with RSUs
or a family hiring a nanny had no section of their own, and every one of those pages started with
a link to someone else's business.

## What changed

There is now a section called **US personal tax, pay & retirement**, at
[/c/personal-tax/](https://marisstella.app/c/personal-tax/). It holds the 53 tools that work out one
household's own taxes, pay and retirement: RMDs, Roth conversions, Social Security claiming age,
IRMAA, ESPP, ISO and RSU tax, the child tax credit and EITC, NIIT, wash sales, QCDs and the rest.
It has its own title and description, so the page can be found by the search people actually type,
plus an icon and a share-card colour.

Tax tools for a business's own books stayed in back-office: self-employment tax, quarterly
estimates, solo 401(k), the R&D credit, payroll deposits and the country-by-country freelancer
set-asides. A test now checks both sides of that line.

The rule is an exact list of slugs, and the slugs were removed from the four rules they used to sit
in, so the code shows where each tool lives. Before and after, I listed the category of every one
of the 1,398 entries in `ventures/`. The two lists differ in exactly 53 lines, all of them moves
into the new section.

Moving the 34 back-office tools out also gives back-office room for future tools, so the next
back-office tool doesn't have to be filed somewhere else to save space.

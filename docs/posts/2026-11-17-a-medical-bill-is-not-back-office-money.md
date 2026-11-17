---
title: "A medical bill is not back-office money"
seo_title: "Giving 31 household money tools their own section"
date: 2026-11-17
tags: [polish, seo, platform]
description: "A patient's bill checker said 'Back-office money & contracts' above its heading. 31 household tools now sit in a section of their own."
---

Until today the [medical bill error checker](https://marisstella.app/medical-bill-error-checker/)
opened with a breadcrumb that said **Back-office money & contracts**. The tool is for a patient
holding an itemized hospital bill. The same label went into the page's `BreadcrumbList` markup,
which is what a search result can show under the link.

It had company. A tenant checking whether a landlord missed the deposit deadline, a homeowner
reading an escrow shortage, someone deciding whether mortgage points pay off, a family checking a
funeral home's price list: 31 tools for one household's own money were filed in sections written
for businesses. Twelve were in back-office, four in service business pricing and fifteen in
"Creator & solo earner income", next to sponsorship rate calculators.

## Why it happened

Each section on the site can be downloaded for offline use, and each download has a size ceiling.
When back-office was near its ceiling, new household tools went wherever there was room. The code
comments explained each choice ("one person deciding what to do with their own spare cash"), so
nothing looked wrong in the code. On the page it did.

## What changed

- A new section, **Household money, home & health bills**, holds the 31 tools: mortgages and
  escrow, rent vs buy, student-loan plans, car lease quotes, utility and solar decisions, medical
  bills and insurance denials, deposit deadlines, funeral quotes and the wedding budget.
- The donation bunching planner moved to **US personal tax, pay & retirement**, where the other
  deduction tools are.
- Landlord, investor and employer tools stayed where they were: rent rolls, house hacking, the
  H-1B lottery odds calculator. They are about running something, not a household's own bills.
- A test now fails if a new Roth, IRA, RMD, IRMAA or Social Security tool lands outside the
  personal tax section. Earlier runs noted that check three times without adding it.

This is the same move as the [personal tax section](https://marisstella.app/writing/a-retirement-planner-filed-under-restaurants/) earlier today: the section a tool sits
in is the first thing a reader sees about it, so it should name who the tool is for.

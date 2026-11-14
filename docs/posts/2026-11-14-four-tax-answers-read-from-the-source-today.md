---
title: "Four tax answers, read again from the source the day they went up"
seo_title: "2026 mileage rate, nanny tax and FUTA thresholds, EU OSS EUR 10,000"
date: 2026-11-14
tags: [polish, aeo, tax, payroll, vat]
description: "Four calculators now open with a sourced, dated answer: 2026 mileage rates, the $3,000 nanny-tax line, $42 FUTA and the EU's EUR 10,000 OSS threshold."
---

When someone asks an AI assistant a tax question, the assistant leans on pages that give the answer in one plain paragraph and name where it came from. Most of our calculators started with a question as the heading and a sentence telling you what to type, so the answer only appeared once you had typed something.

Today four more tools open with the answer instead. Each figure was read again this morning from the primary source rather than copied from the tool's own comments:

- **Mileage.** The 2026 IRS business rate is 72.5 cents a mile for January to June and 76 cents from July 1. A whole year of miles can't be multiplied by one rate. Source: the IRS "Standard mileage rates" page, which lists IR-2025-128 and IR-2026-29.
- **Nanny tax.** Social Security and Medicare apply once one household employee's cash wages reach $3,000 in 2026, at 7.65% each side, with Social Security stopping at $184,500. FUTA starts once you pay $1,000 in cash wages in any quarter: 6% of the first $7,000, usually 0.6% after the state credit. Source: IRS Publication 926 (2026).
- **Employer payroll.** 6.2% on the first $184,500, 1.45% on everything, and FUTA that usually works out to $42 per employee a year, or more in a credit-reduction state. Source: IRS Publication 15 (2026).
- **EU VAT OSS.** You can charge your home rate on cross-border B2C digital services and distance sales of goods while they stay at or under EUR 10,000 a year (all EU countries together, this year and last). Above that, each sale takes the customer's country's rate, and the quarterly OSS return is due by the end of the month after the quarter. Source: the European Commission's One Stop Shop guidance.

## Why a test sits behind each one

A lead that drifts from its calculator is worse than having no lead, because an assistant would quote the wrong number with confidence. So `platform/pages/answer-lead.test.mjs` reads every figure out of each lead and fails if the tool's own code doesn't export it. That covers each dollar amount, both cents rates for mileage, and the euro threshold plus the quarter-end due dates for OSS. If next year's Publication 926 moves the $3,000 threshold and someone updates the calculator but not the paragraph, the build goes red.

One tool on the list was left out. The IFTA fuel-tax calculator's answer depends on the IFTA Articles of Agreement, and I couldn't read them from this session. An answer I couldn't check against its source doesn't go on the page.

Nothing here claims a ranking or citation change. That isn't measured, and the leads are only a day old.

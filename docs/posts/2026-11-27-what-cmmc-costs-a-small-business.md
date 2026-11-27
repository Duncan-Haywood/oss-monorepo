---
title: "What CMMC costs a small business, from DoD's own line-by-line estimate"
date: 2026-11-27
tags: [for-customers, machine-shop-guides, cmmc, defense-contractors, compliance, lead-magnets]
seo_title: "CMMC cost for a small business: DoD's estimate, line by line"
description: "DoD priced every CMMC assessment in the final rule: $5,977 a year at Level 1, $37,196 and $104,670 over three years at Level 2. What those numbers include, what they leave out, and how to redo them with your own rates."
---

Ask what CMMC costs and you get vendor answers: a range, a call to book, a figure that happens to match what the vendor sells. There is a better first source. When the Department of Defense published the CMMC rule (32 CFR part 170, [89 FR 83092](https://www.govinfo.gov/content/pkg/FR-2024-10-15/html/2024-22905.htm), 15 October 2024), it had to estimate the cost to the businesses it regulates, and it showed the working: for each level, who does the work, how many hours each person spends, at what hourly rate, and how long the assessor's team is on site.

The new [CMMC cost page](https://marisstella.app/machine-shop-guides/cmmc-cost.html) lays out those lines as the rule prints them and recomputes them with the rates a shop actually pays.

## DoD's numbers for a small business

| Level | Assessment and its affirmation | Over three years |
|---|---:|---:|
| Level 1 (Self), every year | $5,977 | $17,931 |
| Level 2 (Self), every three years | $34,277 | $37,196 |
| Level 2 (C3PAO), every three years | $101,752 | $104,670 |

The three-year Level 2 figures add two annual affirmations of $1,459 each. The C3PAO's own share of the certification is $31,234: three assessors for 120 hours at $260.28. The Level 1 three-year total is ours (the rule prices one year; the self-assessment repeats annually).

The hours sit mostly with an outside IT provider. The rule assumes "small entities are likely to outsource IT and cybersecurity to an External Service Provider (ESP)", at $260.28 an hour, a rate that "includes the labor rate, overhead expense, G&A expense, and profit". The shop's director is priced at $190.52 an hour. For a Level 2 certification, DoD expects the director to spend 126 hours and the ESP 176 hours on preparing, sitting through the assessment and reporting.

## What the numbers leave out

The rule is explicit: "cost estimates are not included for an entity to implement the CMMC Level 1 or 2 security requirements, maintain implementation of these existing security requirements, or remediate a plan of action for unimplemented requirements." DoD's reasoning is that FAR 52.204-21 and DFARS 252.204-7012 already required those safeguards years ago, so CMMC only adds the cost of proving them.

For a shop that has not implemented all 110 NIST SP 800-171 requirements, that excluded part is usually the larger one: multi-factor authentication, FIPS-validated encryption, logging and review, an incident response plan, perhaps a separate enclave for CUI. The estimate also assumes the shop passes on the first attempt.

So the page asks for those as the shop's own figures (a one-time cost to close gaps, a yearly running cost) and ships none of its own. Your [SPRS self-check](https://marisstella.app/machine-shop-guides/sprs-score-calculator.html) gives you the list of gaps to price.

## Redo it with your own rates

The page starts at DoD's rates. Change any of them: your own director's loaded rate, the hourly rate your managed IT provider actually charges, or your own rate in the ESP line if you will do that preparation in-house. If you have a C3PAO quote, it replaces DoD's team hours. The result is the assessment, a year-by-year table and a three-year total, downloadable as a Markdown file for a budget or a conversation with your IT provider.

## Checking the figures

The session that built the page read the rule from govinfo and saved the cost section in the repository. A test finds every hour, rate, quoted sentence and stated total in that saved text, and recomputing the lines at DoD's rates gives the rule's totals back to within a few dollars of rounding. That check turned up one inconsistency in the rule: the larger-business Level 2 (C3PAO) reaffirmation lists one line as 8 hours but prices it at 16, and its total only adds up at 16. The page uses 16 and says so in its source notes.

## Which level, right now

As checked on 24 November 2026, Phase 2 of the CMMC rollout, which would have required C3PAO certification from 10 November 2026, has been suspended since 13 July 2026, so new solicitations should ask only for Level 1 (Self) or Level 2 (Self) for now ([Level 1 vs Level 2](https://marisstella.app/machine-shop-guides/cmmc-level-1-vs-level-2.html) has the sources). Certification still belongs in a budget for a shop whose primes ask for it, or that wants to be ready when the suspension ends.

The cheapest assessment is a small one. Keeping CUI on fewer machines (the [scoping worksheet](https://marisstella.app/machine-shop-guides/cmmc-scoping-worksheet.html) sorts assets into the rule's categories) and arriving with a drafted [system security plan](https://marisstella.app/machine-shop-guides/nist-800-171-ssp-template.html) cuts the paid hours in DoD's own model. We are building a CMMC workspace that keeps the SSP, POA&M, evidence and affirmations in one place between assessments; it is in early access on the [manufacturing page](https://marisstella.app/industries/manufacturing/). It certifies no one: only an authorized C3PAO can.

*Not legal, compliance or financial advice. Not affiliated with or endorsed by the Department of Defense. Get quotes from your IT provider and an authorized C3PAO before you budget on these figures.*

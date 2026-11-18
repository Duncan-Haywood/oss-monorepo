---
title: "Checking 2026 401(k), IRA and HSA limits against the IRS text: one sentence was wrong"
seo_title: "2026 401(k), IRA and HSA limits checked against IRS Notice 2025-67"
date: 2026-11-17
tags: [ventures, quality, tax]
description: "A new check pins 19 retirement and HSA limits from IRS Notice 2025-67 and Rev. Proc. 2025-19. Across all venture pages, one FAQ gave 2025's IRA limit for 2026."
---

The mega backdoor Roth calculator had one FAQ answer that said a traditional IRA was "capped at $7,000 for 2025/2026, plus a $1,000 catch-up at 50+". The 2025 part was right. For 2026 the cap is $7,500 and the catch-up is $1,100. Anyone reading that answer this year would have put $500 less into an IRA than they could have, or $600 less if they were 50 or over.

The calculator's own numbers were right. Its 401(k) table had every 2026 limit correct. The mistake was in a sentence about a different account, so no test of the calculator could catch it.

## Where the figures come from

Each year the IRS publishes the new retirement plan limits in a notice. For 2026 it is Notice 2025-67, and it gives every new figure next to the old one: "is increased from $7,000 to $7,500". So one primary document pins both years. The HSA and high-deductible plan figures for 2026 are in Rev. Proc. 2025-19, section 3. Both PDFs downloaded from irs.gov today, and `pdftotext` read them cleanly.

The calculator's sourcing note said that when it was built in September, the notice PDF "did not return extractable text in this session". So its figures had been cross-checked between two secondary summaries, and its footer said so. The footer now cites the notice.

## The check

`platform/ci/check_plan_limits_2026.py` pins 19 limits. Each has a 2025 and a 2026 figure:

- the 401(k)/403(b)/457 deferral ($23,500 to $24,500), the age-50 catch-up ($7,500 to $8,000), the 415(c) annual additions cap ($70,000 to $72,000) and the compensation limit ($350,000 to $360,000);
- the SIMPLE deferral and its catch-up, and the key-employee threshold;
- the IRA limit and its catch-up, and the Roth IRA phase-out ranges;
- the HSA self-only and family limits ($4,400 and $8,750 for 2026), plus the HDHP minimum deductibles and out-of-pocket maximums.

The check cuts every shipped venture file into sentences. It flags a sentence that names 2026 and the limit and gives the 2025 figure but not the 2026 one. A sentence that gives both years ("$7,000 for 2025 and $7,500 for 2026") passes. So does history wording ("up from $4,300").

One false alarm on the first pass shaped a rule. $7,500 is the stale 401(k) catch-up, but it is also the current IRA limit. So a sentence about the IRA that says $7,500 is reading the 2026 figure, and the check now treats it that way.

## What it found

The two FAQ copies of that sentence, one in the visible answer and one in the page's FAQ structured data, were the only hits across the whole `ventures/` tree. Both are fixed.

I also read the tables that hold these limits as code: the solo 401(k) calculator, the HSA limit calculator, the backdoor Roth pro-rata calculator and the bookkeeper's retirement worksheet. Every figure matched the IRS text. The bookkeeper's worksheet had warned on every result that its limits were "from memory of IRS notices, not checked against irs.gov". That was true when it was written, because irs.gov refused the proxy that day. All ten of its figures match the notice, so the warning now says that, with the date of the check.

## What this does not cover

The check reads sentences, not data structures. A table keyed `2026: { deferral: 23500 }` with no limit word on the same line would get past it, which is why I read the four tables by hand. It also only knows the limits listed above. The Social Security wage base and the standard mileage rate are 2026 figures too, but their sources (ssa.gov and the IRS mileage notice) were not read here: ssa.gov answered 403 through the proxy.

The 2027 limits come out next autumn. Adding them means adding a row per limit to the check, from the 2027 notice text, with the date it was read.

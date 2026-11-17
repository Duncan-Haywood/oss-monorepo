---
title: "Quality census: a cookie diff that could not see _ga, and 0 of 4 subjects met the bar"
seo_title: "Quality census: a consent tool blind to _ga, 0 of 4 at the bar"
date: 2026-11-17
tags: [quality-audit, evaluation, testing]
description: "Four never-audited subjects, none at the bar. Worst: a consent-diff tool read only Set-Cookie, so _ga and other JavaScript cookies never appeared."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode (seed `2026-11-17-21f8`). Census mode sweeps subjects that have never been audited. It does not draw a uniform sample, so its scores stay out of the sampled share. That share is unchanged at **33 of 306** (Wilson 95% interval 8% to 15%).

The four audit files are `2026-11-17-*.json` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each one holds every check and every seeded bug. All scores were set before any fix. For each subject I reran the auditor's key check myself before accepting the audit.

## The number

**0 of 4 meet the bar. All four are finished** (completeness 3). Three of the four got every recomputed number right. What keeps every one of them below the bar is verification: across the four, their own tests caught **12 of 21** hand-seeded bugs.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/consent-change-record | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| ventures/surety-bond-capacity-calculator | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/feie-physical-presence-calculator | 3 | 3 | 2 | 3 | 3 | 3 | 2 | no |
| research/peer-noise-rent | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |

Coverage: 369 of 2,486 subjects have now had at least one audit (14.8%).

## The subjects

**ventures/consent-change-record (correctness 2, one high defect).** The tool compares a browser trace taken before a consent choice with one taken after, so a privacy engineer can see what a "reject all" really changed. The first thing such a reviewer looks for is a cookie that is still written after a refusal, usually `_ga`, `_fbp` or `_gcl_au`. Analytics JavaScript writes those cookies, and they never arrive in a `Set-Cookie` header. The HAR diff read only `response.cookies`, so it reported "Cookies appeared: 0" for exactly the finding it exists to catch. HAR 1.2 records cookies the browser sends under `request.cookies`. The JSON comparator had a second problem: it matched requests on the full URL. A GA4 `/g/collect` beacon present in both traces, with only the per-hit `_p` value changed, came out as 1 added, 1 removed and 0 unchanged. I reran that case and got `1 1 0`. The tool's own HAR path already strips query strings for this reason. A comparison page also said the report shows which requests "fire regardless", but the report listed only additions and removals. 2 of 5 seeded bugs survived.

**ventures/surety-bond-capacity-calculator (verification 2).** The arithmetic is right. The premium on a $1M contract at $25, $15 and $10 per $1,000 comes to $13,500, the same figure as Old Republic Surety's published example. I reran it and got `13500`. The bond-inclusive price, the limits and the exact chance of winning past the aggregate limit all matched an independent recomputation. Two things fall short of an underwriter's view. Aggregate capacity is working capital times 20, with no net worth input at all, where practice takes the lesser of 10 to 20 times working capital and 10 to 20 times net worth. Working capital is also used as typed, with no adjustments. Two seeded bugs survived, both in columns a user acts on: "fits today" with the aggregate check removed, and "working capital needed" with the backlog left out.

**ventures/feie-physical-presence-calculator (verification 2).** The auditor checked this tool against the IRS physical presence test page, the 2026 Form 2555 instructions and Pub 54. An independent brute force matched it on the IRS's own New Zealand example. I reran the 2024 case and got 338 foreign days, 366 qualifying days and $126,500. The limits for 2023 to 2026 are correct. One defect was silent: any tax year outside that table fell back to the 2025 limit, so 2022 showed $130,000 where Rev. Proc. 2021-45 sets $112,000. Three of six seeded bugs survived, among them removing proration altogether. The proration can also count up to 35 days of the 12-month period that fall before arrival or after departure. Those days count only while the person's tax home was abroad.

**research/peer-noise-rent (claims 2, verification 2).** Every headline number reproduces. `run.py` matches `results.txt` byte for byte, and an exact multinomial enumeration that does not import the project matched the variances, the rent (0.01985) and the deductibles. The defect is in the baseline. The simulated "fresh penalty" scheme pairs each task's first report with the next task's second, so neighbouring penalty terms share a task and covary. At report marginals of ½, the only place the tests and E1 look, that covariance is zero. Away from ½ the simulation is noisier than the formula the paper reports. I reran it at p = 0.2 with both reporters at 0.9 accuracy and n = 200: 2.17e-3 simulated against 1.92e-3 from the formula. The paper also cites no prior work, and its baseline is a scheme the project built for itself, not Dasgupta and Ghosh as published.

## Fixed in the same PR

The scores above are from before these fixes. A later re-audit will score them.

- **consent-change-record:** requests now match on method, origin and path. The HAR diff also reads `request.cookies` and counts each cookie once per host. The report gains a "fire regardless" section. `llms.txt` loses the calculator text it had copied. New tests catch the GA4 case, the `_ga` case and both seeded bugs that had survived.
- **surety-bond-capacity-calculator:** new tests catch both surviving bugs. Negative working capital now gets its own warning. The page no longer says the chosen bids "will not overcommit you" when the default accepts a 10% chance of it. The aggregate note gives the 10 to 20 times range. The net worth cap and the underwriter adjustments are listed under "Known gaps".
- **feie-physical-presence-calculator:** a year with no built-in limit now asks for the IRS figure instead of borrowing 2025's, and 2022 ($112,000) is built in. The travel-day note now says a move between foreign countries that takes under 24 hours loses no days. The result warns when the qualifying period runs past the stays. New tests catch the proration, leap-year and earliest-date bugs that had survived.
- **peer-noise-rent:** a test pins E4's n = 115, which catches both surviving `sample_size` bugs. The README's variance now includes the (2(n−1)/n)² factor. The "√2 at the null" and "95%" claims are qualified. Fixing the simulator would change every simulated figure in the paper, so the neighbour pairing, the self-built baseline and the missing related work are listed under "Known gaps".

## What this round says

This is the same pattern as the [previous census](2026-11-17-quality-census-the-limit-was-the-blank-holes.md). The arithmetic is right more often than not. Tests check what the author thought of and miss the case a practitioner reaches first. In the two worst defects, the tests sat exactly where the bug could not appear. The consent tool was tested only with cookies set by a server. The research simulator was checked only at marginals of ½, the one point where its error is zero. A test written by someone who knows the field, such as a cookie set by JavaScript or a skewed base rate, would have caught each of them.

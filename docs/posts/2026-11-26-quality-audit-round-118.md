---
title: "Quality audit round 118: 0 of 2 sampled at the bar; an S-corp page cites its leading case by the wrong name"
seo_title: "Quality audit 118: 0 of 2 sampled; S-corp case mis-captioned"
date: 2026-11-26
tags: [quality-audit, evaluation, testing]
description: "0 of 2 sampled subjects meet the bar. The arithmetic is right in both, but seeded bugs survive their tests, and an S-corp page mis-names its key case."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This round's evidence is two files with seed `2026-11-26-l-ae8a` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `2026-11-26-s-corp-reasonable-compensation-calculator.json` and `2026-11-26-job-application-tracker.json`. Each file lists every check and every seeded bug. All scores were set before any fix.

The round ran in mode `sample` and drew two ventures, neither audited before. No flagship was drawn, because every flagship was audited in the last seven days. No platform directory was drawn either, because every one was audited in the last 90 days. Research is paused. I audited both subjects myself in this session, so there was no auditor's file to spot-check. Every number below was recomputed by hand or checked against an outside source.

## The number

**0 of 2 randomly sampled subjects meet the bar.** Across every sampled audit, 40 of 453 now meet it (Wilson 95% interval 7% to 12%).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/s-corp-reasonable-compensation-calculator | 3 | 3 | 2 | 3 | 2 | 2 | 3 | no |
| ventures/job-application-tracker | 3 | 3 | 2 | 3 | 3 | 3 | 3 | no |

Both subjects get their numbers right. Both miss the bar because seeded bugs in their core rules survive the tests. That is the most common reason for a miss: only 156 of 649 audited subjects score 3 or more on verification.

## S-corp reasonable compensation calculator

The reviewer is a CPA who sets S-corp owner salaries every year.

**The arithmetic is right.**

- I recomputed four FICA figures by hand and all four matched to the cent: $15,300 on a $100,000 salary, $30,578 on $250,000 for a single filer, $135 of Additional Medicare tax on $140,000 married filing separately, and $10,257.73 of extra FICA to raise the salary in the Watson case from $24,000 to the court's $91,044 benchmark.
- The 2026 Social Security wage base of $184,500 matches the Social Security Administration's notice in the Federal Register (2025-19763).

**Worst defect: the leading case is cited by the wrong name.** The case appears 16 times across the pages, README and code, including the explainer's title, always as "Watson v. Commissioner". The case at 668 F.3d 1008 is *David E. Watson, P.C. v. United States*. It was a refund suit in federal district court, not a Tax Court case. A CPA who copied the citation from this page would get it wrong.

Other findings:

- One warning says the low-salary-plus-distribution pattern appears in "every reported" adjustment case, and no file supports "every".
- The page says Watson's firm made "$200,000–274,000" of profit a year. No file gives a source for that range, and I could not confirm it.
- A salary larger than the business's earnings gets no warning.
- The tool asks for a comparable wage, the input the whole test turns on, but only names the Bureau of Labor Statistics wage survey. It doesn't link to it or to any lookup.
- I seeded 4 bugs and 3 survived the tests: a wrong threshold for married filing separately, the boundary where the salary equals the comparable wage, and a check that keeps the distribution from going negative.

**Fixed in this round:** the case is now captioned *Watson v. United States* everywhere, with the full caption in the README. New tests kill all three surviving bugs.

## Job application tracker

The reviewer is a career coach who runs job-search programmes. A senior web engineer reviewed its CSV and calendar exports.

**The rules are right.** Nine checks passed: the follow-up dates (7 days after applying, 3 after a screen), the 30-day quiet flag on the exact day, leap years, the response rate and median days to a reply, and the CSV guard against formula injection, which follows OWASP's list.

**Worst defect: two seeded bugs survived, one of them in a security rule.** Removing `-` from the characters the CSV export guards against left every test green. So did moving the boundary of the "due soon" list by one day.

**Worst user-facing gap: moving from a spreadsheet loses data without saying so.** A spreadsheet that re-saves dates as `11/20/2026` and salaries as `120,000` imports with blank dates and no salary, and the page gives no message.

Two smaller defects in the calendar file:

- Long lines aren't folded at 75 octets as RFC 5545 requires. One event's summary line ran to 159 characters.
- DTSTAMP, which should record when the event was created, is fixed at 1 January 2026.

**Fixed in this round:**

- New tests kill both surviving bugs.
- Import now reads `$120,000` and `120,000` salaries.
- The import message now says how many rows had dates it could not read. It does not guess at them, because `11/12` could mean either month.

The calendar defects are still open.

## What changed since round 117

The share of sampled subjects at the bar moved from 39 of 447 to 40 of 453, because other rounds landed in between. This round added two more misses. It confirms the pattern of the last several rounds: the code gets the numbers right far more often than its tests would catch it getting them wrong.

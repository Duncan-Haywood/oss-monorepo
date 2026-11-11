---
title: "Reading Form 2210 at last: one $400 rule, and the penalty both ways"
seo_title: "Form 2210 Schedule AI and the underpayment penalty, checked"
date: 2026-11-11
description: "The ai-bookkeeper's annualized-income worksheet, checked against the 2025 Form 2210's own text: one fix to self-employment tax, and the penalty now figured both ways."
tags: [ai-bookkeeper, tax, estimated-tax, self-employed]
---

If your income is lumpy, the IRS lets you pay estimated tax as you earn it instead of in four equal parts. The method is Schedule AI on Form 2210, the "annualized income installment method". The [ai-bookkeeper](https://marisstella.app/ai-bookkeeper/) has had a worksheet for it since October, but it was built from memory and a search excerpt, because irs.gov did not answer from the build container. Today it did, so the 2025 form and its instructions were read in full and the worksheet compared with them line by line.

Most of it held up. The annualization amounts (4, 2.4, 1.5, 1), the applicable percentages (22.5% to 90%) and the carry-forward lines 22 to 27 are as coded. The form's "other" period dates, which the old notes listed as not modelled, turn out to be for estates and trusts only, so a sole proprietor never needs them.

One real difference was in self-employment tax. Schedule AI works it out in its own Part II, and the instructions for line 28 say: if your self-employment income for the period is under $400, enter zero. The old shortcut annualized first and tested afterwards. A freelancer with $300 of profit by March 31 has $277 of net earnings for that period, so the form charges no self-employment tax in that column. The shortcut annualized it to $1,108, passed the $400 test, and added about $170 of tax to the first installment. Part II now runs as printed. Its line 29 limits ($44,025, $73,375, $117,400, $176,100) come out exactly from the 2025 wage base, and the tests check them.

The bigger addition is the penalty itself. Until now the worksheet said what each date required and left the cost of missing it to you. It now runs Part III of Form 2210 and the penalty worksheet from the instructions. The underpayment rate comes from the IRS's quarterly table: 7% throughout 2025, then 6% for April to June 2026. Your payments go first to the oldest unpaid installment, and each underpayment is charged for the days it stays unpaid, up to April 15. The tests reproduce the instructions' own worked examples, including the "04/30 $2,000, 06/15 $2,000" allocation and the 15 and 61 day counts, plus the table of days for each rate period.

It also runs the penalty both ways, so you can see whether Schedule AI is worth the trouble. Take someone who earned $4,000 by February and $100,000 by November 2025, filed single and paid $20,000 on January 15. Under the regular method the penalty comes to $602.92. Using Schedule AI it is $37.28, because the first three dates asked for almost nothing. Both figures were checked by hand. The page and `cli.mjs annualized` show the two numbers side by side and mention box C when it lowers the penalty. On the page you can now enter dated estimates such as `2025-06-16:1500`.

What it still leaves out: box D (counting withholding on the dates it was actually withheld), the rule that filing and paying by January 31 removes the January penalty, and waivers. For tax year 2026, the January to April 2027 rate hasn't been published yet, so the worksheet uses the last published rate and says so. It is a worksheet. Form 2210 and its instructions decide.

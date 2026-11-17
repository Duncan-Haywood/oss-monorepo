---
title: "Can you reweight away the web-survey slice? A test where the answer is known"
seo_title: "GSS web surveys: does demographic reweighting fix church attendance?"
date: 2026-11-11
tags: [research, catholic-demography, GSS, survey-methods]
description: "Raking on 13 covariates removes about 40% of a known 11-point GSS attendance selection gap, and none of the 10-point web gap among 2022-24 Catholics."
---

Since 2021 most General Social Survey interviews have been done on the web. Earlier posts in this series found that web respondents are a different slice of people, not people whose answers the web changes. In the 2016-20 panel, people who later chose the web had already reported 11 points less weekly church attendance at an in-person interview. The usual fix for a skewed slice is to reweight it on demographics until it looks like everyone else. Does that work here?

**A test where the truth is known.** In the panel, everyone's first interview was in person, so the first-wave gap between people who later chose web and those who later chose phone is pure selection. I raked the web group's weights to match the phone group on three nested sets of first-wave covariates, then recomputed the gap (bootstrap over survey clusters, raking redone in every draw):

- **Age, sex, ethnicity and education** remove 43% of the 11.1-point gap (interval 23% to 87%).
- **Adding** region, marital status, children, nativity, size of place, household size and work status removes nothing more. Adding political views and party also removes nothing more. A selection gap of 6.6 points [1.1, 11.9] remains among people who match on all of these.
- **Applied to the 2020 wave**, the same reweighting still leaves an 8-point web gap. The within-person estimate from the earlier post is 1.6 points. An analyst who trusted the reweighting would have blamed the web for about 7 points of selection.

**In the 2022 and 2024 cross-sections** (web against in person, within year):

- Catholics on the web report **10 points** less weekly Mass attendance. After reweighting on the same covariates, the gap is still 9.6 points [4.1, 15.3]. Demographics remove none of it.
- Web respondents are **10 points** more often "no religion". Demographics remove 3% of that gap, and politics brings the total to 18%.
- The share who are Catholic now hardly differs by mode (-1.0 points, interval includes zero).

**What it changes.** Weighting post-2020 religion figures on demographics doesn't make them comparable with earlier years: the people who choose the web differ in religiosity in ways that age, education, family and politics don't capture. This programme will read post-2020 attendance from the in-person interviews. There, Catholic weekly attendance in 2022-24 is 2.2 points below 2016-18, with an interval of -8.9 to +4.5. The all-mode series gives an upper bound on the fall.

**Limits.** The panel check compares web with phone, not with in person. Covariates come from an interview two to four years before the mode choice. Two crashes in the first runs (infeasible raking cells) were fixed before any number was seen, and the log records how.

Code, tables and the full log: [`research/catholic-demography`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/catholic-demography) · [live page](https://marisstella.app/research/catholic-demography/).

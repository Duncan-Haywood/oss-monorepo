---
title: "Did Catholic Mass attendance really fall after 2020, or did the survey change?"
seo_title: "Catholic Mass attendance drop in the GSS: real or survey mode?"
date: 2026-11-04
tags: [catholic, demographics, research, data, religion]
description: "Catholic weekly attendance in the GSS fell 5.5 points after 2020, but web respondents report 9 points less than in-person ones."
---

In the General Social Survey (GSS), 23% of Catholics said they attend Mass weekly in 2016-18 and about 18% in 2021-24, a fall of 5.5 points (95% interval 1.6 to 9.3). Before reading that as a collapse, note that the GSS changed how it interviews. Before 2020 it was almost all in person. In 2021 it was 87% web.

Two checks from the second step of the [`catholic-demography`](https://duncan-haywood.github.io/oss-monorepo/research/catholic-demography/) research programme:

- **Non-Catholics fell by the same amount** (5.7 points), which fits a survey-wide change in method as well as a change in behaviour.
- **In the same years, web respondents report less.** In 2022 and 2024, Catholics who answered on the web say they attend weekly 9.1 points less often than those interviewed in person (interval 2.4 to 15.9). Adjusting for age, sex, ethnicity and degree changes nothing.

Using only in-person interviews, weekly attendance of Catholics in 2022-24 is 2.2 points below 2016-18, with an interval from -8.9 to +4.5. That is consistent with no change, and also with a real fall of several points, because only 542 Catholics were interviewed in person. The prediction I wrote down beforehand, that in-person Catholics would show no drop, came out as predicted, but the data can't carry much weight.

What this does not settle: web respondents in 2022 and 2024 include people who did not answer the in-person attempt, so the gap mixes mode and who responds. The next step is an outside check against other attendance series and the GSS panel. Until then, I'd treat any trend line that jumps in 2021 as partly a survey artefact. Code, tables and the log are in the repository. Written with AI assistance.

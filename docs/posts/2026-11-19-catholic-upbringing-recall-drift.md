---
title: "Do people forget a Catholic upbringing as they age? A little, at the rate their own re-reports show"
seo_title: "Recall drift in 'raised Catholic' reports, GSS 1977-2018"
date: 2026-11-19
tags: [research, catholic-demography, GSS, demography, religion]
description: "Within US birth cohorts the share saying they were raised Catholic falls 0.07 points a year, the same rate the GSS panels show for the same people."
---

Two days ago I found something awkward in the General Social Survey (GSS). The same birth cohorts of US-born mothers said they were raised Catholic 2.4 points more often when interviewed at 25-44 than at 45 or older. Your upbringing is fixed by the time you are 16, so in a fixed group of people that share should not move. Something in the measurement was changing, and I listed three suspects: people re-describing their own childhood as they age, a change in who is left to interview (deaths, emigration, who agrees to take part), or the 2021-24 survey waves, which were mostly answered on the web.

**The test.** The GSS has two sources that see different parts of this. Its yearly cross-sections follow a birth cohort as it ages, but they interview different people each time, so a fall in the share can be drift or a change in who answers. Its 2006-10 panels asked the same people again two and four years later, so a fall there can only be the same people answering differently. If the two rates per year match, drift explains the cross-sections. I wrote four predictions into the script and committed it before the first run. I left out the 2021-24 waves so the web could not drive the main test.

**What came out.**

- **There is a small, steady drift.** Within US-born cohorts aged 25-64, surveyed 1977-2018, the share saying they were raised Catholic falls **0.072 points a year** (95% interval 0.018 to 0.124). That is about 1.3 points over 18 years.
- **The same people drift at the same rate.** In the panels, US-born adults' own answers fell 0.084 points a year over four years (interval -0.08 to +0.25). The two rates differ by **+0.012 points a year (-0.16 to +0.19)**. The fall in the cross-sections is the size people's re-reports predict, and nothing about who is left to interview is needed to explain it. The panel is small, though. The interval still allows a composition effect of up to about 3 points over 18 years, so the test does not rule one out.
- **The 2.4-point gap was mostly about which cohorts were counted.** The earlier step weighted the mothers' birth years by how many respondents' mothers came from each one. That put 59% of the weight on women born 1935-47, the cohorts where the young-minus-old difference is +3 to +4.5. Weight each birth year by its own size and the difference is **+0.7 points (-0.7 to +2.0)**, and +0.3 without the web waves. In some cohorts it is positive and in others negative. It is not a general fall with age.

**What it changes.** The earlier step split a 3.7-point fall in the mothers' Catholic share between 25-44 and 45+ into about 1.5 points of women leaving the Church and 2.2 points of the cohorts "remembering" their upbringing differently. That second part now looks mostly like cohort mix, not a property of the survey. The 3.7-point fall in current Catholic identification was not retested here. The next step reruns it with the same birth-year weighting. If it holds up, more of the gap between what children say about their mothers and what the mothers' generation says about itself is real switching after child-rearing. Either way, the programme's main finding stands: immigration, not Catholic fertility, held the US Catholic share up.

**Limits.** Neither source can separate getting older from the calendar year passing, because both advance together. The panel covers 2006-14 only, and it is small. Treating the within-cohort trend as a straight line in age is an approximation. For the mothers' cohorts alone, the slope even points the other way.

Code, tables and log: `research/catholic-demography/experiments/m5p_recall_drift/`. Live page: https://marisstella.app/research/catholic-demography/

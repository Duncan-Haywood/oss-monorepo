---
title: "Were Catholic mothers more Catholic while raising their children? Partly, and partly a survey artefact"
seo_title: "Catholic mothers by age at interview in the GSS"
date: 2026-11-17
tags: [research, catholic-demography, GSS, demography, religion]
description: "GSS mothers seen at 25-44 close most of a 4.8-point Catholic gap, but only 1.5 points of the change is women leaving the Church after child-rearing."
---

Earlier today I showed that the gap in my model of who gets raised Catholic is not about family size. US adults with two US-born parents say their mothers were more Catholic than the survey's own women of the mothers' generation: 27.7% against 22.9% for people born 1965-99, a 4.8-point gap. Catholic mothers did not have more children than women report. So the question became how Catholic the mothers were.

There is an obvious mismatch in what is being compared. A respondent reports their mother's religion "when you were growing up", when she was roughly 25 to 44. The women's side of my model used the religion General Social Survey (GSS) women give at interview, at 45 or older. If women leave the Church after their children are grown, the older women are the wrong yardstick.

**The check.** The GSS is a repeated cross-section from 1972, so a cohort of women is interviewed at different ages in different years. I rebuilt the women's side from mothers interviewed at 25-44 (and 35-49 as a check) and compared it with the 45+ version for the same birth cohorts. I also tracked how many of those same women said they were *raised* Catholic. If the younger-age table is just the same women before some of them left, that share should not change with age. Four predictions went into the script, committed before the first run.

**What came out.**

- **The same cohorts are more Catholic at child-rearing ages.** For the mothers of people born 1965-99, 26.7% of mothers interviewed at 25-44 are Catholic, against 22.9% at 45+: **+3.7 points (95% interval 2.1 to 5.4)**.
- **That closes most of the gap.** Against the 25-44 yardstick the children's report is only 1.1 points higher (interval -1.7 to +4.0), down from 4.8. About a fifth is left.
- **But the women are not the same.** The share who say they were *raised* Catholic is also 2.4 points higher (0.7 to 4.2) when the same cohorts are interviewed young. I predicted under 1 point, so this check fails. Split after the fact, about 1.5 points of the 3.7 is women leaving the Church after child-rearing. The other 2.2 is that a cohort's own account of its upbringing depends on when it was asked.
- **The age range does not matter much.** With 35-49 instead of 25-44, the difference is +2.8 points and 41% of the gap is left. The switching part is again about 1.5 points.

**What it means.** The children are roughly right about their mothers, as long as the mothers are measured at the ages that matter. Some of the gap is real religious change: women who were Catholic while raising children and are not at 45+. More of it is something less comfortable for anyone using the survey: the same birth cohort gives a different raised-Catholic share depending on the year and age at which it is asked. For the youngest cohorts the sign even flips, and they are seen at 45+ mostly in the 2021-24 waves, when web respondents report a Catholic upbringing 5 points more often than in-person ones. That needs its own test, separating age from survey year and mode, and it is the next step. None of this moves the programme's main finding that immigration, not Catholic fertility, held the US Catholic share up.

**Limits.** These are different people at different ages, not the same people followed over time, so age and survey year are tangled within a cohort. The mothers of people born before 1965 were mostly past 44 when the GSS began asking where respondents were born, so they could not be tested. Mothers' religion is the child's recollection.

Code, tables and log: `research/catholic-demography/experiments/m5o_lifecourse/`. Live page: https://marisstella.app/research/catholic-demography/

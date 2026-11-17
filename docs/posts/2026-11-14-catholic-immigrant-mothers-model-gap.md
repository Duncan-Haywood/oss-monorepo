---
title: "Immigrant mothers fit the Catholic model once they get their own numbers. US-born mothers stop fitting."
seo_title: "Were US Catholic mothers more Catholic than their generation? GSS"
date: 2026-11-14
tags: [research, catholic-demography, GSS, demography, religion, immigration]
description: "GSS: with their own Catholic share, immigrant mothers fit the model, but US-born mothers were 4 points more Catholic than their generation predicts."
---

Yesterday's step ended with a hypothesis. My model of who gets raised Catholic in the US undercounts by 2 to 4 points: children take their mother's religion, and Catholic mothers have slightly more children. Most of the shortfall looked like immigrant mothers. The model gave every mother the Catholic share of all US women her age, and immigrants' children reported mothers who were twice that. Today I tested the fix: give immigrant mothers the Catholic share and family size of foreign-born women in the General Social Survey, and give US-born mothers those of US-born women. I wrote five predictions into the script and committed it before the first run.

**What came out.**

- **The fix works for the older immigrant families.** For people born 1925-64 whose mother was an immigrant (160 respondents), the mothers were 52.7% Catholic and the corrected model says 49.9%. The gap was 28 points before and is now 2.7 (95% interval -6.4 to +12.0).
- **It does not work for the younger ones.** For people born 1965-99 with an immigrant mother, the mothers were 70% Catholic against a model of 48%. Foreign-born women of that generation in the survey are 41-45% Catholic. The immigrants who raised US-born children were more Catholic than immigrant women of their age in general.
- **The overall gap gets bigger, not smaller.** I predicted it would close to within a point. It went from 2.6 to 4.1 points (2.5 to 5.6). The reason is US-born mothers. Measured against US-born women only (about 22% Catholic in those generations), their children report mothers who were 26.9% Catholic, 4.1 points above the model. The old model fit them only because its Catholic share included immigrant women.
- **The gap is not just mixed families.** US-born women who married immigrant men were about twice as Catholic as their generation, but there are few of them (122 of 3,318 respondents). In families where both parents were US-born, the mothers are still 3.4 points more Catholic than the model says. To close that gap, Catholic mothers would need to have had about 1.27 times as many children as other mothers. GSS women of that generation report 1.05. I looked at this split after seeing the results, so it is exploratory.
- **The main finding does not move.** The question this programme is testing is whether immigration or Catholic fertility held the US Catholic share up from the 1990s to 2010-18. With fertility measured separately for immigrant and US-born women, fertility's contribution is -0.32 points (-0.60 to +0.04), against -0.37 before. Immigration's is +1.07.

**What it means.** The model's shortfall is two things, not one. For immigrant families before about 1965 it was the wrong Catholic share for the mothers, and that is now fixed. For US-born families the mothers were more Catholic than survey women of their generation by 3 to 4 points. Either Catholic women had more children than older GSS respondents report, or the survey's oldest women undercount Catholics. These mothers, born about 1897-1936, are only seen from 1977 on, at ages 41 and older, so who survived to be interviewed matters.

**Limits.** Parents' religion is the respondent's memory of it. The survey asks where people were born only from 1977, so immigrant women born before about 1935 borrow the figures of the nearest covered group. The immigrant-mother groups have 150-160 respondents each.

**Next.** Check the fertility ratio against an outside source on completed family size by religion for women born 1900-40, to tell "Catholic fertility understated" from "Catholic share understated".

Code, tables and log: `research/catholic-demography/experiments/m5m_mothers_nativity/`. Live page: https://marisstella.app/research/catholic-demography/

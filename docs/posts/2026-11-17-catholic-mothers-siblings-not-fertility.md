---
title: "Did Catholic mothers have more children than surveys show? Their children's sibling counts say no"
seo_title: "Catholic fertility in the GSS checked against sibling counts"
date: 2026-11-17
tags: [research, catholic-demography, GSS, demography, religion, fertility]
description: "GSS sibling counts show Catholic mothers born 1897-1936 had no more children than surveys show; the model's gap is how Catholic the mothers were."
---

Three days ago my model of who gets raised Catholic in the US was left with a gap it could not explain. People born 1925-64 to two US-born parents say their mothers were 26.2% Catholic, and the model says 22.8%. The model assumes children take their mother's religion. It uses two inputs from the General Social Survey (GSS): the Catholic share of women in the mothers' generation, and how many children Catholic women had compared with other women. To close the gap, Catholic mothers would have needed 1.27 times as many children as other mothers. GSS women of that generation report 1.05.

So which input is wrong? Either Catholic women had more children than the older women in the survey report, or the mothers were more Catholic than the survey's women of their age. Outside data on completed family size by religion (federal fertility surveys, census tables) was blocked from this session, so I used a check inside the GSS. I wrote five predictions into the script and committed it before the first run.

**The check.** Every GSS respondent says how many brothers and sisters they had. That gives the size of the family they grew up in, reported by the child, so it does not depend on whether the mother lived long enough to be interviewed. A sample of children over-represents big families, because a family with six children has six chances to be sampled. Weighting each person by 1/(siblings + 1) undoes this and recovers the mothers. This is a standard demographic identity (Preston 1976). One snag is that this release top-codes siblings at "6 or more" (22.5% of these respondents), so I compared family sizes capped at 7 on both sides, and for the mothers I varied the size given to the 7+ group from 7 to 12.

**What came out.**

- **Catholic families were not bigger than Catholic women report.** Children of Catholic mothers come from slightly bigger families than GSS Catholic women of that generation report (+0.12 children, capped). Children of other mothers do too (+0.18). The step-siblings counted in the question, and mothers who died before they could be interviewed, would push both up. The Catholic-specific difference is **-0.06 children (95% interval -0.22 to +0.09)**. I predicted it would be positive. It isn't.
- **The gap is in how Catholic the mothers were.** After reweighting to mothers, 24.4% of them were Catholic, against 20.8% of GSS mothers 45 and older of the same generation: **+3.5 points (2.1 to 5.3)**. The ratio of children per mother, Catholic to other, is 1.10 from the children's reports and 1.09 from the women's. Of the 3.8-point gap, 3% is fertility (-25% to +28%) and the rest is the mothers' Catholic share. That holds whatever size I give the "7 or more" families.
- **Across everyone, the Catholic family-size edge is small.** Among all 34,697 US-born adults born 1925-64, those raised Catholic come from families 1.07 times as large as others (1.055 to 1.083). I had predicted at least 1.15. For people born 1965-99 the edge is gone (1.00).
- **The main finding gets stronger.** This programme is testing whether immigration or Catholic fertility held the US Catholic share up from the 1990s to 2010-18. With the sibling-based fertility ratio, fertility accounts for 0.13 points of the 1990s Catholic share (the earlier estimate was 1.17) and -0.05 points of the change, against +1.07 for immigration.

**What it means.** The "Catholic fertility" explanation for the gap is out: children's own family sizes match what women report. What is left is that the women who raised these respondents were about 3.5 points more Catholic, when their children were young, than the survey's mothers of their generation are when interviewed at 45 or older. Two explanations fit. Some women may have become Catholic at marriage and left later, so they count as Catholic in their children's answers but not at interview. Or children may remember their mother's religion as their own upbringing. These are different claims, and the next step tests the first with the women's own religious histories.

**Limits.** The sibling question counts step-siblings, adopted siblings and the father's children by other partners. Capping at 7 throws away detail on the biggest families on both sides. Parents' religion is the respondent's memory of it.

Code, tables and log: `research/catholic-demography/experiments/m5n_siblings/`. Live page: https://marisstella.app/research/catholic-demography/

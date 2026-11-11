---
title: "Ask the same people twice: is 'raised Catholic' a reliable answer, and do web surveys lower church attendance?"
seo_title: "GSS panel test-retest: raised Catholic reports and web-mode attendance"
date: 2026-11-11
tags: [research, catholic-demography, GSS, survey methods]
description: "95.4% of GSS panel respondents raised Catholic say so again two years later (kappa 0.93). People who later answered by web reported 11 points less weekly attendance even in person."
---

Two puzzles from this week's Catholic demography work came down to one question: when the 2021-24 General Social Survey moved mostly to web interviews, did the *answers* change, or did the *people answering* change? Cross-sections can't tell those apart, because every wave asks different people. The GSS panels can, because they ask the same people again.

The GSS data host refused this session's connections, so I read the files from the [gssr](https://github.com/kjhealy/gssr) R package's copies. Before using them I reran the first milestone from that copy, and every estimate and sample size matched the NORC file.

**Is "raised Catholic" a stable answer?** In the 2006, 2008 and 2010 panels, 4,633 people were asked their religion at age 16, then asked again two years later.

- 95.4% of those who said "raised Catholic" said it again. Agreement corrected for chance (kappa) was 0.93, and the share answering Catholic barely moved: -0.06 points [-0.65, +0.53].
- Over four years the answers drift a little, by -0.77 points, and only among people who are Catholic now. They become slightly *less* likely to say they were raised Catholic.
- That is the opposite direction from the rise in the raised-Catholic share seen in the 2021-24 web interviews, so recall error can't explain that rise.

**Does answering on the web lower reported Mass attendance?** The 2016-20 panel interviewed people in person in 2016 or 2018, then again in 2020-21, by web or by phone.

- The people who later chose the web had *already* reported 11 points less weekly attendance [-17.9, -4.2] at the first interview, when everyone sat with an interviewer.
- Their change from then to 2020 differed from phone respondents' by only -1.6 points [-8.5, +5.4].
- So most of the web-versus-in-person gap of about 9 points seen in 2022-24 is who chooses the web, not what the web does to the answer. The interval is wide, so a mode effect of a few points is not ruled out.

**Why it matters.** Anyone comparing 2021-24 religion figures with earlier years, whether a diocese, a researcher or a journalist, needs to adjust for who answered, not for how they answered. The pandemic overlaps the 2020 wave, and the 2020 contrast is web against phone, not against face to face.

Code, tables and the full log: [`research/catholic-demography`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/catholic-demography) · [live page](https://marisstella.app/research/catholic-demography/).

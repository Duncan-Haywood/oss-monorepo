---
title: "Did immigrants stop holding up the US Catholic share after 2018? Mostly a web-survey artefact"
seo_title: "US Catholic immigrants 2022-24: web vs in-person GSS interviews"
date: 2026-11-13
tags: [research, catholic-demography, GSS, demography, survey-methods]
description: "GSS 2022-24: 21% of web-answering Catholics are foreign-born vs 29% in person; in person, the post-2018 fall in the immigrant contribution is -0.44 points."
---

Two days ago I reported that immigrants, not large Catholic families, kept the US Catholic share steady from the 1990s to 2010-18. That post also said something I flagged as shaky: after 2018 immigrants' contribution to the Catholic share fell by 1.38 points, the largest part of the recent drop. Today I checked that claim against the web-interview problem, and it mostly does not hold.

**Why it needed checking.** The General Social Survey changed how it collects data during the pandemic. 2021 was all web, and in 2022 and 2024 about half the interviews were done on the web. Earlier steps found that the people who choose to answer by web differ from the people interviewed in person. They report less churchgoing and more "no religion", and weighting them on age, education and the like does not fix this.

**How.** I reran the same accounting five ways, swapping in a different 2020s sample each time: all modes without the all-web 2021 wave, in-person interviews only, web only, and each arm of the 2022-24 experiment that randomly decided whether a household was first approached face to face or by a mailed web invitation. I wrote four predictions into the script and committed it before running it.

**What came out.**

- Of Catholics who answered by web, **20.9%** are foreign-born. Of those interviewed in person, **28.9%** are (difference +8.0 points, 95% interval +3.6 to +12.5).
- The two randomised arms do not differ on nativity (-0.2 points, -4.0 to +3.6). So the gap comes from who ends up answering by web, not from anything the web questionnaire does to the answers.
- With in-person interviews only, the change in immigrants' contribution from 2010-18 is **-0.44 points (-1.38 to +0.49)**. The face-to-face-first arm gives -0.63 (-1.46 to +0.21). Neither can be told apart from zero. My fourth prediction, that the fall would survive this check, is refuted.
- About a third of the original -1.38 comes from the 2021 web-only wave alone.
- The fertility side does not move in any version (within 0.1 points), and the main 1990-2018 result predates web interviews, so it stands.

**Limits.** In-person respondents in 2022-24 are selected too: they are the people who answered the face-to-face attempt. The in-person sample is a quarter of the full one, so its intervals are wide. A falling immigrant contribution is still possible. What the data no longer show is a large one.

I have corrected the earlier post and the project README. The next check is an outside one: the Census Bureau's American Community Survey has the true foreign-born share of adults, so it can say which GSS sample gets nativity right.

Code, tables and log: `research/catholic-demography/experiments/m5k_inperson/`. Live page: https://marisstella.app/research/catholic-demography/

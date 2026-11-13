---
title: "Mixed Catholic marriages: children follow the mother's faith far more often than the father's"
seo_title: "Mixed Catholic marriages: are children raised Catholic? GSS 1988-2018"
date: 2026-11-13
tags: [research, catholic-demography, GSS, demography, religion]
description: "GSS 1988-2018: 72% of children with only a Catholic mother were raised Catholic vs 42% with only a Catholic father. Explains a fifth of a model gap."
---

Two days ago I reported that immigrants, not large Catholic families, held the US Catholic share up between the 1990s and 2010-18. That accounting rested on a simple model: children are raised in their mother's religion, and Catholic mothers had somewhat more children. The model had a known problem. It predicted 2 to 4 points fewer US-born adults raised Catholic than the survey actually finds, and I had parked that gap with a loose upper bound. Today I looked at where the gap comes from.

**The data.** In several years between 1988 and 2018 the General Social Survey asked people what their mother's and father's religion was when they were children. 5,714 US-born adults answered about their mother, 5,236 about both parents. I wrote five predictions into the script and committed it before running the full analysis.

**What came out.**

- **Mothers pass on the faith far more often than fathers.** Among people born 1925-64 with exactly one Catholic parent, 72% (95% interval 67 to 77) of those whose mother was the Catholic were raised Catholic. When only the father was Catholic it was 42% (36 to 48). The 30-point gap is about the same in every birth cohort.
- **No visible break in 1970.** Until 1970 the Church required that all children of a mixed marriage be brought up Catholic. I predicted that children born before about 1965 would be raised Catholic more often when only the father was Catholic. They were not: the father-only rate is about 42% before and after. By what children report, the old promise was kept less than half the time when the father was the Catholic.
- **Mixed marriages explain only a fifth of the model's gap.** Gains (raised Catholic though the mother was not) slightly outweigh losses (mother Catholic, child not), by +0.56 points (-0.01 to +1.01). That is 18% of the gap. I predicted at least half, so that prediction is refuted.
- **The rest is mostly immigrant mothers.** The model gave every US-born adult's mother the Catholic share of all US women of her generation, about 25%. Children of immigrants report mothers who were 50% Catholic. For people whose parents were both US-born, the gap almost disappears (1.3 points, half of it from mixed marriages). This split was not among my predictions; I added it after seeing the first results and label it that way.
- **The main result stands.** Counting mixed-marriage transmission as its own channel, it moved the Catholic share between the 1990s and 2010-18 by -0.07 points (-0.44 to +0.28). Immigration's +1.07 is unchanged.

**Limits.** These are children's memories of their parents' religion, sometimes decades later. People whose own upbringing was clear-cut may remember their parents as matching it. Only about one child in ten had exactly one Catholic parent, so each mixed-couple estimate rests on 150 to 175 people.

**Next.** Rebuild the model so that immigrants' children get their own mothers' Catholic share, taken from foreign-born women in the survey, and check that the model then fits.

Code, tables and log: `research/catholic-demography/experiments/m5l_parents/`. Live page: https://marisstella.app/research/catholic-demography/

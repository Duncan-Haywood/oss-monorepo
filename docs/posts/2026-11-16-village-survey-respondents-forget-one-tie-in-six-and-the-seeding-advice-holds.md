---
title: "Village survey respondents forget about one tie in six, and the seeding advice still holds"
seo_title: "Tie recall in network surveys and seeding: 43 village networks"
date: 2026-11-16
tags: [research, networks, diffusion, seeding, surveys]
description: "Capture-recapture on converse survey questions puts tie recall at 84% in 43 villages; at that recall a half-village survey still seeds near a census."
---

The `civ-seeding` programme asks whom a product rollout should seed first when the data cannot tell how adoption spreads. It works on the 43 Karnataka villages where a lender introduced microfinance (Banerjee, Chandrasekhar, Duflo and Jackson, 2013). Earlier steps produced practical advice. Survey half the households, three quarters of them at random and the rest chosen as the households the first ones named most. Then rank households by **degree discount** on the ties you were told about. That loses about 1.5% of adopters against the best rule, close to what a full census of ties achieves.

That advice assumed every respondent names every tie. Real respondents forget. This step asked two questions: how much do they forget, and does the advice survive it?

## Measuring forgetting from the survey itself

We did not assume a recall figure; we measured one. The BCDJ survey asked questions that come in converse pairs: whom do you borrow money from, and to whom do you lend money? The same for kerosene and rice, and for visiting and inviting home. If household A borrows from B, A should say so under "borrow" and B should say so under "lend". Where both households were surveyed, the two answers are two independent captures of the same relationship. The Lincoln–Petersen estimator, the method ecologists use to count fish by tagging and recapturing them, then gives each question's recall.

Over the 43 villages (4,414 surveyed households):

- borrowing money: 75% of ties named; lending money: 68%;
- kerosene and rice: 81% both ways;
- visiting: 83%; inviting home: 81%;
- the three questions together: **84%** (village by village, 72% to 97%).

One honest caveat: the estimator assumes the two ends forget independently. If both ends tend to forget the same weak ties, true recall is lower than 84%.

## Scoring the advice with forgetful respondents

We then reran the seeding comparison with each surveyed household naming each tie with probability ρ. The comparison used 500 bootstrap draws in which all three contagion models are refitted. The estimated degrees are not corrected for ρ, because a field team would not know it. Three hypotheses were logged before the run, and all three held:

| median share of adopters lost | perfect recall | 85% (measured) | 50% |
|---|---|---|---|
| census, degree discount | 1.1% | 1.4% | 1.6% |
| half survey, 3/4 random, degree discount | 1.6% | **1.8%** | 2.3% |
| census, top degree | 4.0% | 4.1% | 3.8% |

At the measured recall, the half survey loses 0.2 point more than with perfect recall. It beats ranking a perfect census by degree in 99% of draws. Forgetting costs the survey about as much as it costs a census (0.7 against 0.5 point when half of all ties are forgotten). And degree discount on a census that forgets half its ties still beats top degree on a perfect census in 99% of draws. Knowing roughly who is connected to whom matters more than recording every tie.

One result we cannot yet explain: 75% recall scored slightly worse than 50% for three of the four rules. The intervals overlap, so it may be noise, and we have not tested it.

## What it does not say

These are counterfactuals from fitted models on 43 villages, not a field trial. The BCDJ network, itself built from a twelve-question survey, is taken as the truth, and the forgetting is added on top. Respondents never invent ties here, and recall is assumed independent from tie to tie. Next, the programme will let strong ties be remembered more often than weak ones. The code, the pre-registered plan and every number are in `research/civ-seeding` (LOG.md, 2026-11-16, milestone 11; `experiments/m11_recall/`). These are models of past adoption, not advice about any real village. This post was written with AI assistance.

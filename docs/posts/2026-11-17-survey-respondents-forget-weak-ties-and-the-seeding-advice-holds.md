---
title: "Survey respondents forget weak ties four times as often as strong ones, and the seeding advice still holds"
seo_title: "Tie strength and recall in network surveys: 43 village networks"
date: 2026-11-17
tags: [research, networks, diffusion, seeding, surveys]
description: "Capture-recapture by tie strength in 43 villages: weak ties recalled 61% of the time, strong 94%. A half-village survey still seeds within about 2%."
---

The `civ-seeding` programme asks whom a product rollout should seed first when the data cannot tell how adoption spreads. It works on the 43 Karnataka villages where a lender introduced microfinance (Banerjee, Chandrasekhar, Duflo and Jackson, 2013). Earlier steps gave a practical rule. Survey half the households, three quarters of them at random and the rest chosen as the households the first ones named most. Then rank households by **degree discount** on the ties people reported. [Yesterday's step](2026-11-16-village-survey-respondents-forget-one-tie-in-six-and-the-seeding-advice-holds.md) measured how many ties respondents forget, about one in six, and found that the rule survives that.

That measurement assumed every tie is equally easy to forget. It also had a known weak spot. Capture–recapture (the Lincoln–Petersen estimator) compares two answers about the same relationship: "I borrow from them" and "I lend to them". If both ends tend to forget the same weak ties, the method overstates recall. This step checked both problems, with a plan and five hypotheses written down before any number was computed.

## How strong is a tie?

The BCDJ survey asked twelve network questions. Besides the three converse pairs used for recall (money, kerosene and rice, visiting), it asked about advice, decisions, medical help, kin, non-kin socialising and temple company. So a crude but free measure of a tie's strength is how many of those six other questions also name the pair. We split the ties into three groups: named by none of the six, by one, or by two or more. Then we re-ran capture–recapture within each group.

| ties named by the six other questions | share of the network | recall of the three-question generator |
|---|---|---|
| none | 20% | **61%** |
| one | 41% | 81% |
| two or more | 39% | **94%** |

The pattern is clear (the difference is +0.34, 95% village bootstrap interval +0.30 to +0.36). The same rise shows up in every single question pair. Borrowing money is the starkest: a money tie with no other connection behind it is recalled about a third of the time, against 80% when three or more other questions back it up.

Corrected for this, overall recall is **81%**, not 84%. The pooled figure was only a little high, because weak ties are a fifth of the network. That was a hypothesis with a bar of 80%, so it held, narrowly: the interval reaches 79%.

## Does uneven forgetting break the seeding rule?

We then reran the seeding comparison: 500 bootstrap draws, each refitting three models of how adoption spreads, with each surveyed household naming each tie at its group's measured recall. Two comparison settings went alongside. One forgets every tie at the same average rate (82%). The other halves weak-tie recall to 30%.

| median share of adopters lost (worst model) | every tie recorded | uniform 82% | measured, uneven |
|---|---|---|---|
| half survey, 3/4 random, degree discount | 1.8% | 2.2% | **2.2%** |
| census, degree discount | 1.2% | 1.8% | **0.9%** |
| census, top degree | 4.2% | 5.0% | 5.1% |

The half survey loses 2.2% under measured forgetting and beats top degree on a perfect census in 98% of draws. With weak-tie recall halved it loses 2.9% and still beats it in 90%. Census degree discount beats that benchmark in 99 to 100% of draws in all three settings.

One hypothesis failed, and not in the direction we feared. We predicted uneven and even forgetting would cost the same, within half a point. For degree discount on a census, uneven forgetting did *better*: 0.9% against 1.8%, and slightly better than with every tie recorded. We have not tested why. One candidate: dropping weak ties steers the ranking towards households with many strong, overlapping ties, which may sit nearer the middle of these networks. Treat it with care. Adding rules to the harness re-draws the other rules' random runs, and that alone moved earlier rows by up to half a point, more than the 0.4 we planned for. The 0.86-point gap is less than twice that noise.

## What it does not say

- "Strength" here is a count of other survey questions, and kinship is one of them. It stands in for strength; it does not measure it.
- Within each group, the two ends of a tie still forget independently, so 81% remains an upper bound if the groups miss some unevenness.
- The contagion models weight every tie the same. This tests forgetting weak ties, not whether weak ties matter less for adoption.
- No false ties are reported; nobody names a household they don't know.
- These results come from a fitted model of past microfinance adoption. They are not advice about any real village or household.

## What next

The next step gives each rule a fixed random stream, so adding rules stops moving the others, and then reruns the census comparison. After that come false-positive ties and a contagion model that weights ties by strength. Everything is in [`research/civ-seeding`](https://marisstella.app/research/civ-seeding/): the plan and outcomes in `LOG.md`, the scripts in `experiments/m12_strength/`.

*Produced with AI assistance (Claude Code). The data are the authors' replication archive (Harvard Dataverse doi:10.7910/DVN/U3BIHX, CC0); no affiliation with them is implied.*

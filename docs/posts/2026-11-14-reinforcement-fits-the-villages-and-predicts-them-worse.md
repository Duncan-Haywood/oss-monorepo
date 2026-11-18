---
title: "Complex contagion fits the microfinance villages better, and predicts them worse"
seo_title: "Simple vs complex contagion on the 2013 microfinance village networks"
date: 2026-11-14
tags: [research, civ-seeding, networks, complex-contagion]
description: "On 43 Karnataka village networks, reinforcement and threshold models beat the simple information model in sample but lose leaving one village out."
---

Yesterday we re-ran the estimation code behind *The Diffusion of Microfinance* (Banerjee,
Chandrasekhar, Duflo and Jackson, Science 2013) on its own 43 village networks. Today's step
of the `research/civ-seeding` programme asks the question the programme exists for: does a
new product spread through a village like news, where one informed friend is enough (a
*simple* contagion), or like a behaviour, where you need several friends who already adopted
(a *complex* one)? Whom a solar-home-system or cookstove rollout should seed first depends on
the answer.

We fitted two complex-contagion models next to the paper's information model, on the same
word-of-mouth spread. In the **reinforcement** model a household's chance of adopting grows
with each neighbour who has adopted, and it can come round later as more do. In the
**threshold** model a household also adopts once a set share of its neighbours has. Then we
scored all three the way a rollout would use them: fit on 42 villages, predict the 43rd, and
repeat for every village.

**In sample, the complex models win.** The reinforcement model's best fit adds 0.10 to the
log-odds of adopting per adopting neighbour, the estimate is above zero in 99.5% of 1,000
bootstrap draws over villages, and the fit criterion drops by 41%. The threshold model (adopt
once 60% of neighbours have) also beats the simple model.

**Out of sample, they lose.** Fitted on 42 villages, the reinforcement model predicts the
held-out village better than the simple model in 13 of 43 cases, and in 12% of paired
bootstrap draws; the threshold model in 19 of 43, and 24% of draws. The extra parameter
buys fit to these villages, not to the next one.

We should be clear about one thing. The grid we wrote down before the run could not see a
small reinforcement effect: it stepped in 0.25s and held the base adoption rate fixed, so
any positive effect pushed take-up above the data and lost. The run showed us that, and the
fine-grid fit with a free base rate is a second, labelled post-hoc test. Its out-of-sample
verdict is the same as the pre-registered one.

**What the data do show** is a steep curve. Among households that are not leaders, 8.3% took
a loan with no adopting neighbour, 14.3% with one, 20.3% with two, 24.3% with three and 35.0%
with four or more. The simple model, fitted to the same data, predicts 8.1% rising only to
27.2%. It puts too many adopters next to exactly one adopter and too few next to four or more,
and both gaps are outside village-bootstrap noise. That convex shape is what reinforcement
predicts, but people who resemble each other also cluster and adopt together (homophily), and
well-connected households may simply be different. One snapshot of adoption cannot tell
those apart.

So, after two steps: the simple information model is not beaten where it counts, and the data
carry a hint of reinforcement that a cross-section cannot pin down. Freeing reinforcement also
cuts the fitted rate at which adopters spread the word from 0.3 to 0.1: the two mechanisms stand
in for each other. Whether *any* moments of this kind can separate them is the next step: we
will simulate villages from each fitted model on the real networks and see how often the
estimation recovers the model that made them.

Code, data (CC0) and the research log, with every hypothesis written before its run:
[`research/civ-seeding`](https://marisstella.app/research/civ-seeding/). Written with AI
assistance (Claude Code). No affiliation with the study's authors is implied, and none of this
is advice about any real village or household.

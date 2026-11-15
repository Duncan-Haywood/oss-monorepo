---
title: "The McGrews' 10^44 for the resurrection: the arithmetic holds, and one choice carries 39 of the 44"
seo_title: "The McGrews' 10^44 resurrection Bayes factor, checked"
date: 2026-11-15
tags: [philosophy-of-religion, bayes, resurrection, probability, research]
description: "The McGrews' Bayes factor is exactly 10^2 x 10^39 x 10^3. The 10^39 comes from treating thirteen disciples as independent; a shared explanation caps it at 1/q."
---

The biggest number in the Bayesian argument over the resurrection is Timothy and Lydia McGrew's Bayes factor of 10^44, from "The Argument from Miracles" in the *Blackwell Companion to Natural Theology* (2009). Our [theism-formal-evidence](../../research/theism-formal-evidence/README.md) programme has used it as the top of its range for the resurrection item since the first milestone. Until today the figure came from second-hand reports.

The authors' own draft of the chapter is online, with addenda dated September and December 2025. Here is what it says (page numbers are from the draft):

| evidence | Bayes factor | where |
|---|---|---|
| the women's report of the empty tomb and the risen Jesus | 10^2, "a conservative estimate" | p. 31 |
| one disciple's testimony | "at least three orders of magnitude", 10^3 | p. 39 |
| thirteen disciples, multiplied "under the assumption of independence" | 10^39 | p. 39 |
| the conversion of Paul | "at least 10^3" | p. 41 |
| all three together | 10^44 | p. 41 |

## The arithmetic holds

2 + 39 + 3 = 44. The McGrews say this factor would overcome a prior of 10^-40 and leave a posterior "in excess of .9999". With exact fractions it comes to 0.99990001, which is above .9999 by one part in a hundred million. They give the 10^-40 as an illustration of how low a prior the evidence could overcome, not as their own estimate. So this is a bottom line that follows from its stated inputs. Swinburne's 0.97 [also did](2026-11-15-swinburne-097-resurrection-bayes-reproduced.md). Shermer's 2% [did not](../../research/theism-formal-evidence/experiments/e6_shermer_check/results.md).

## Where the 44 comes from

Of the 44 orders of magnitude, 39 come from the disciples, which is 88.6% of the total. Those 39 are thirteen separate factors of 1000 multiplied together, and multiplying them treats every non-resurrection explanation as something that would have to strike each disciple separately.

A general inequality shows why that choice matters. Take any explanation H that is compatible with no resurrection and that makes the evidence at least as likely as the resurrection does. If H has probability q given no resurrection, then the Bayes factor can be at most 1/q. Nothing else is needed: the probability of the evidence given no resurrection can't be less than q times the probability of the evidence given the resurrection.

The McGrews discuss one such explanation themselves. They call it a modified vision theory, O*: it makes a disciple's testimony as likely as the resurrection does "more or less by definition", and they put its probability below 0.001. Applied to one disciple, that gives a factor of at most 1000, which is the factor they assign to each disciple. Applied to the group as one event (the thirteen sharing one cause rather than each having a separate rare experience), it caps the factor for all thirteen together at about 1000.

| probability given no resurrection of one explanation covering all thirteen | disciples' factor (log10) | total factor (log10) | lowest prior that still reaches 1/2 |
|---|---:|---:|---:|
| 10^-1 | 1 | 6 | 10^-6 |
| 10^-3 | 3 | 8 | 10^-8 |
| 10^-10 | 10 | 15 | 10^-15 |
| 10^-20 | 20 | 25 | 10^-25 |
| 10^-39 | 38.7 | 43.7 | 10^-43.7 |
| 0 (independence) | 39 | 44 | 10^-44 |

So the 10^39 requires the probability of any group-level explanation, given no resurrection, to be at most 10^-39. That is the per-disciple 10^-3 raised to the thirteenth power. The McGrews write that for the disciples "the independence assumption almost certainly breaks down". They argue on pp. 42 to 46 that the dependence helps their case: knowing that one witness had been killed should frighten the others, so the fact that they held firm is better explained if they were telling the truth. That argument is about how the witnesses influenced each other. It does not address a common cause shared by all thirteen if there was no resurrection, such as a single source for the tradition or the "general reliability" of the Gospels that every factor in the chapter is conditioned on. The draft gives no number for that, and it is the number the 10^39 depends on.

Under independence the margin is also narrow. At the 10^-40 prior, twelve disciples at 1000 each give a posterior of 0.91, and eleven give 0.0099. If each disciple's factor falls from 1000 to below about 492, the posterior at that prior drops under one half.

## What changes, and what doesn't

The case does not collapse. With a group-level probability of 10^-3, the total factor is still 10^8. Our ledger's own bar is a factor of 7.3, which is what the resurrection item needs to make Christianity more likely than not when every prior is even ([E2](../../research/theism-formal-evidence/experiments/e2_ledger/results.md)), and 10^8 clears it by seven orders of magnitude. What 10^8 cannot do is overcome a prior of 10^-40. The argument between the two sides is therefore not really about how strong one disciple's testimony is. It is about two other things: the prior probability of a resurrection, and how probable it is, if there was no resurrection, that one explanation covers all the witnesses at once. That second probability is the item the programme's elicitation milestone (M3) should ask readers on both sides to estimate.

One more number from the chapter's footnote 31: Michael Martin replaced Swinburne's probability of the evidence without an incarnation (1/1000) with 1/500. Put into Swinburne's model, that gives 50/53 = 0.943.

Code, the transcribed inputs and the table: [`experiments/e26_mcgrew`](../../research/theism-formal-evidence/experiments/e26_mcgrew/results.md). Limits: we read the authors' draft, not the printed Blackwell pages, so the page numbers are the draft's; Martin (2005) is cited as the McGrews report it. These are calculations from stated inputs, not a finding about whether the resurrection happened.

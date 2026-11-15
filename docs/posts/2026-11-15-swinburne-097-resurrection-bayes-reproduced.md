---
title: "Swinburne's 97% for the resurrection follows from his inputs. The evidence in it is a factor of 100"
seo_title: "Swinburne's Bayesian resurrection argument: the 0.97 reproduced"
date: 2026-11-15
tags: [philosophy-of-religion, bayes, swinburne, resurrection, probability, research]
description: "Swinburne's four inputs give exactly 100/103 = 0.971. The historical case is a likelihood ratio of 100; one thirty-fold change drops it below a half."
---

In *The Resurrection of God Incarnate* (2003), Richard Swinburne used Bayes' theorem to argue that the probability that Jesus was God incarnate and rose from the dead is "somewhere around .97". Our [theism-formal-evidence](../../research/theism-formal-evidence/README.md) programme collects published Bayesian bottom lines and checks whether they follow from their own inputs. Unwin's 67% for God did. Shermer's 2%, using Unwin's method, [did not](../../research/theism-formal-evidence/experiments/e6_shermer_check/results.md): its six inputs give 0.025%. Swinburne's figure has been on the to-do list for a week, because we could not get hold of the book.

The inputs turned out to be quoted word for word, with page numbers, in Richard Otte's [review in Notre Dame Philosophical Reviews](https://ndpr.nd.edu/reviews/the-resurrection-of-god-incarnate/):

| input | value | page |
|---|---|---|
| probability there is a God, on background knowledge | 1/2 | (Otte's note 2) |
| probability that God, if he exists, becomes incarnate (in the "divided" form Swinburne defends) | 1/2 | pp. 50, 211 |
| probability of the evidence we have about Jesus, if God became incarnate | 1/10 | p. 212 |
| probability of that evidence if God did not | 1/1000 | p. 213 |

## It reproduces exactly

With exact fractions the posterior is **100/103 = 0.9709**. Swinburne's arithmetic is right.

Odds make the structure easier to see. The prior on incarnation is 1/4, which is odds of 1 to 3 (−0.48 in log10). The evidence multiplies those odds by the ratio of the last two inputs, 100 (+2 in log10). That leaves posterior odds of about 33 to 1.

So the whole historical case, covering the empty tomb, the appearances and the life that fits the "marks of an incarnate God", enters as a factor of 100. Other published estimates for the resurrection testimony run to about 10^44 (the McGrews' figure, as secondary sources report it). Swinburne's own case is far more modest than that. It comes out high because the prior he brings in is already generous.

## What moves it

Changing one input at a time, with the others left at Swinburne's values, here is what it takes to drag the posterior down to one half:

| input | Swinburne | for a posterior of 1/2 |
|---|---|---|
| probability of the evidence without incarnation | 1/1000 | 1/30 |
| probability of the evidence with incarnation | 1/10 | 3/1000 |
| prior on incarnation (the two priors multiplied) | 1/4 | 1/101 |
| probability there is a God, alone | 1/2 | 2/101 (about 1/50) |

The cheapest move is the first: a thirty-fold change in the input Otte says Swinburne defends least. Swinburne's main argument for it is that God would not deceive us with this evidence. Otte's own alternative, a 1/3 chance that God becomes incarnate rather than 1/2, barely matters: 20/21, or 0.952.

Otte also makes a coherence point. Swinburne gives a *divided* incarnation, one particular reading of Chalcedon, the same 1/2 he gives incarnation in any form. That is only coherent if the other, unified reading has probability zero. If a share *u* of the incarnation probability goes to the unified reading, the posterior stays above one half until *u* passes 97/101, about 96%. The coherence problem is real, but by itself it does not overturn the conclusion.

## A correction to our own proposal

Our programme's proposal said one input "is reported to move the result from 0.97 to 0.33", and cited the NDPR review. The review does not say that. We have withdrawn the sentence until we can find where the figure came from. Single inputs that would give 0.33 do exist (the no-incarnation evidence at 1/15, for example), but we attribute none of them to any critic.

## Limits

- The inputs come from the review's quotations, not from the book. We have not checked pages 50 and 211 to 213 ourselves.
- The 1/2 for God comes from Swinburne's earlier book, *The Existence of God*, and this check does not examine it.
- Reproducing a calculation shows it is internally consistent. It says nothing about whether the inputs are right.

Code and the full tables, including a grid over the two priors: [E25 results](../../research/theism-formal-evidence/experiments/e25_swinburne/results.md).

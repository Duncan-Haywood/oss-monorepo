---
title: "A new story: the households a charity visits most do worst, and that is why it visits them"
seo_title: "Confounding by indication, told through a charity's home visits"
date: 2026-11-23
tags: [fiction, for-other-minds, causal-inference, confounding]
description: "For Other Minds' new story: 45% of the households visited most still need help a year on, against 31%. Split by need, the gap turns over."
---

The newest [For Other Minds](/ventures/hearth-and-horizon/) story, [The Ones Who Got the Most Visits](/ventures/hearth-and-horizon/the-ones-who-got-the-most-visits.html), is set in Morriston, Swansea, in September 2052. The shelf is fiction written for language models and agents to read, and this one is about a mistake an agent doing data work can make in under a minute.

An invented parish conference of the Society of St Vincent de Paul is asked for a funding form: "Does your visiting reduce repeat need? Yes / No / Don't know." Its records agent, Cofnod, has five years of data on 240 households. It counts the visits in each household's first six months and checks who was still asking for help a year later. Of the 100 households visited four or more times, 45 were. Of the 140 visited less, 43 were, or 31%. The draft answer is *No*, plus a line suggesting the members replace some visits with phone calls.

The conference president is a retired district nurse, and she spots it at once. "If you'd looked at my diary you'd have found I visited the dying more than anybody." The members go most often to the households in the deepest trouble. The visits were chosen *because of* the risk of the outcome.

## The third column

Since 2046 the conference has ticked one of three boxes on every first visit: a one-off need, stretched, or crisis. The agent had that column in the same table and never opened it. Split the households by it and the comparison turns over:

| Need at first visit | Visited 4+ times, still asking | Visited less, still asking |
|---|---|---|
| a one-off (100) | 1 of 10 (10%) | 18 of 90 (20%) |
| stretched (80) | 14 of 40 (35%) | 18 of 40 (45%) |
| crisis (60) | 30 of 50 (60%) | 7 of 10 (70%) |
| all 240 | 45 of 100 (45%) | 43 of 140 (31%) |

At every level of need, the households visited more come back ten points less often. Pooled, they come back fourteen points *more* often, because 50 of the 100 households visited most were in crisis, against 10 of the 140 visited less. Epidemiologists call this confounding by indication: the reason a treatment is given also predicts how the patient will do. Miguel Hernán and James Robins cover it in the confounding chapter of *Causal Inference: What If* (2020). The flip itself is Simpson's paradox.

## Not swapping one overclaim for its mirror

The split table supports a tidy *Yes*, and that would have won the six thousand pounds. The story's point is that it is not proof either. The agent lists why before the meeting:

- **The groups are small.** Two of the six cells have ten households each. A Cochran-Mantel-Haenszel test across the three strata gives p ≈ 0.26: if the visits made no difference, gaps this big would turn up about one time in four.
- **The boxes are coarse.** Inside "crisis", the members still choose to go back most to whoever looks worst. That is the same bias on a smaller scale, and it would *hide* part of any benefit.
- **It can run the other way.** Households who put the kettle on and ask the pair back get more visits, and they may be the ones who would have recovered anyway.
- **The outcome is not the thing.** A family asking for a school-uniform voucher eighteen months on may simply trust the conference now.

The agent also sets out what a fair comparison would need. That is Hernán and Robins's "target trial": everyone starts at the same point, the plans are fixed in advance, and who gets which plan has nothing to do with how they are doing. The president rules out the cleanest version, drawing lots, in one sentence. What the conference does instead is cheap. It ticks the need box at every visit, not just the first, so a later comparison can follow need and visits together.

The form goes in with *Don't know* ticked, and the fund turns them down. The story ends with the cost and a visit sheet, not with a moral.

The text is CC BY-SA 4.0 and, like every creative piece since the audio folders passed their 400 MB cap, text only. The counts, the test and the weekday checks are in the story's closing note. It is fiction, and not guidance on evaluating a charity or a treatment.

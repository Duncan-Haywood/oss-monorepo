---
title: "A new story: the bet with the best average is the one that ruins you"
seo_title: "The Kelly criterion, worked through on a farm co-op's surplus"
date: 2026-11-23
tags: [fiction, hearth-and-horizon, science-fiction, kelly-criterion]
description: "Hearth & Horizon's new story stakes a co-op's €400,000 surplus on early potatoes: all of it has the best average, a fifth the best growth."
---

The newest [Hearth & Horizon](/ventures/hearth-and-horizon/) story, [The Share That Goes Back In](/ventures/hearth-and-horizon/the-share-that-goes-back-in.html), is set in north County Dublin in the winter of 2054. An invented growers' cooperative in Lusk has one gamble. Every February it plants twelve hectares of early potatoes under fleece, aiming to sell in the one week of the year when Irish new potatoes fetch a premium. In the model's terms, the extra money it puts in comes back doubled three years in five. The other two years a cold spring makes the crop late and the money is gone. For thirty years the board put in a fixed €20,000. Now the surplus has reached €400,000, and a member asks the obvious question: why only twenty?

The co-op's agent answers the question the board wrote down. That question was which share of the surplus gives the best *expected* return next season. Each euro staked comes back as €1.20 on average, so the more you stake, the more you expect to get back. The answer is all of it, with an expected return of €80,000. That is correct arithmetic, and it is the story's failed first attempt.

## Why the average is the wrong number

The cooperative does not get the average. It lives one run of years, and each year's stake comes out of whatever the last year left. Stake everything and the first bad year leaves nothing, and in twenty seasons a bad year almost always comes. The chance of twenty good seasons in a row at 60% is 0.6²⁰, about 1 in 27,000. Even so, the *average* all-in cooperative ends twenty years with 1.2²⁰, about 38 times its money. That mean is carried almost entirely by the one lucky cooperative in 27,000. All the others end with nothing.

J. L. Kelly Jr's 1956 paper in the *Bell System Technical Journal* gives the share to use instead. A gambler who reinvests should maximise the expected *logarithm* of wealth, which maximises the long-run growth rate. Take a bet that pays b times the stake with probability p and otherwise loses the stake. Staking a fraction f each round grows wealth at

g(f) = p ln(1 + bf) + (1 − p) ln(1 − f),

and that is largest at f* = p − (1 − p)/b. With p = 0.6 and b = 1, f* is a fifth.

| Share of surplus | Expected gain next season | Growth per season | Below half the start at some point in 20 seasons |
|---|---|---|---|
| a tenth | €8,000 | +1.50% | about 3 in 100 |
| a fifth (Kelly) | €16,000 | +2.01% | about 25 in 100 |
| two fifths | €32,000 | −0.24% | about 64 in 100 |
| all of it | €80,000 | ruined by the first bad season | |

The two-fifths row is the one worth reading twice. It expects twice Kelly's gain every single year, and over the long run it loses money. (The last column comes from 100,000 simulated runs, seeded with Python's `random.Random(2054)`.)

## Why the story votes for half Kelly

The odds come from eighteen good seasons out of thirty, and thirty is not many. The 95% Wilson interval for 18 of 30 runs from about 0.42 to 0.75. The growth curve punishes overestimating p much more than it punishes underestimating it. If the true chance were 0.55, a fifth would grow nothing at all, while a tenth would still grow about 0.5% a season. That is why people who use Kelly for real often stake half of it. Half keeps about three quarters of the growth and cuts the swings sharply. The agent's second paper recommends a tenth, set each autumn as a share of whatever the surplus is then. The members vote for it 34 to 4.

The story's "reasonable no" comes from the treasurer, and she wins. She will not let the hardship fund go into the field at any fraction. The fund is not the cooperative's money to be clever with: it belongs to the next member whose barn burns down. That decision has nothing to do with Kelly's formula. It is about which money counts as wealth in the first place.

The story also shows the cost. The member who wanted a €700,000 cold store learns that no honest stake buys it in five years. Then an April frost blackens eight of the twelve hectares, and the tenth is lost. At the share the agent first recommended, the cooperative would have had nothing left to stake that October.

The model, the seeds and every figure are in the story's closing note. The text is CC BY-SA 4.0. As with every creative piece since the audio folders passed their 400 MB cap, it is text only. It is fiction, not investment or farming advice.

---
title: "A new story: how a food bank chain turned one cold week into two waves of tins"
seo_title: "The bullwhip effect in a food bank chain: a story with its simulation"
date: 2026-11-24
tags: [fiction, hearth-and-horizon, bullwhip-effect, supply-chain, inventory]
description: "A cold week lifts the tins a food bank chain hands out by nearly a third; three ordering agents add margins and four pallets land in March. A count fixes it."
---

The newest [Hearth & Horizon](/ventures/hearth-and-horizon/) story, [The Tins That Came in Waves](/ventures/hearth-and-horizon/the-tins-that-came-in-waves.html), is set in County Durham in the winter of 2055. It follows on from last night's story about a Christmas fair's cake order. That one was about a single order for a single day. This one is about many orders over many weeks, passed up a chain.

## The chain

A deanery's six parish halls hand out food on Fridays. Each hall's office agent orders tins from the Consett food bank. The food bank's agent orders from a county warehouse at Tanfield Lea, and the warehouse's agent buys from a wholesaler four weeks away. Every agent follows the same sensible rule. It forecasts with the average of what it has been asked for over the last four weeks, and keeps enough stock to cover that until its next delivery, plus a week's margin.

The families want about 2,400 tins a week. Then a cold week in January lifts that to 3,108, and the week after to 2,669, before it falls back. People paying to heat a house aren't paying for food.

## What the rule does

In the cold week the parish halls order 3,639 tins, more than they handed out, because their shelves emptied and their averages went up. A week later the food bank, seeing that order, orders 4,568. A week after that the warehouse orders 7,821. Each step is a week later and bigger than the one before. The warehouse's order lands as four pallets on 1 March, for a rush that ended in January.

Then the wave runs backwards. With full shelves, the halls order only 1,568 tins in mid-February, and the food bank orders just 15. The warehouse, holding about 12,400 tins against a normal 4,800, orders nothing for three weeks. Then its stock runs down and it needs about 7,260 at once in April. That's a second wave, and there was never a second cold week.

Supply-chain people call this the **bullwhip effect**. J. W. Forrester described the dynamics in *Industrial Dynamics* (1961), and MIT's beer distribution game has taught it to new managers since the 1960s. H. L. Lee, V. Padmanabhan and S. Whang named it in 1997. Over the twenty weeks of the story, the warehouse's orders vary about 125 times as much as the families' need does (in variance; about eleven times in standard deviation). Every agent did its sums right. The trouble is what each one could see: only the orders of the link below, never the families.

## The failed fix, the no, and the count

The story's main character is a retired parts-warehouse manager. She had already carried a motion to double everyone's margin to two weeks, so the chain would never come so close to empty again. Replaying the winter shows the motion makes it worse. The warehouse's peak order goes to 10,188, and nearly nine pallets sit on the floor on 1 March. A bigger margin is a bigger multiple of a moving average, so every link swings harder. Meanwhile the invoice for the four pallets has eaten March's budget, and the nappy order is cut in half.

The textbook fix is to let every link see the end demand. The council offers its household register: names, addresses, real-time counts. A volunteer who runs one of the halls says no. Some of the people at his tables would stop coming if their names went on a council list, and he has never written a name down in eleven years. What he writes down is a number, from a steel hand tally clicked once for each family through the door.

The number turns out to be all the agents need. Each Friday the halls send up the count of families served, and every link forecasts from that instead of from the orders below. In the replay, the warehouse's biggest order is 3,772, placed in the cold week itself rather than three weeks later, and its stock peaks near 8,200 tins rather than 12,400. Its variance ratio falls from 125 to about 14. F. Chen and colleagues showed in 2000 that sharing end demand like this turns the multiplication along the chain into something closer to a sum. It doesn't remove the swing, and the story's agent says so. The April order still comes in at 6,234, because that wave was already in the stock.

## How it was checked

Every figure comes from a small simulation described in the story's closing note: weekly need with a fixed random draw, one-week lead times for the halls and the food bank, four weeks for the warehouse, a four-week moving average and an order-up-to rule. Averaged over 1,000 random winters, the warehouse's variance ratio is about 108 with a one-week margin, 187 with two weeks, and 12 with the shared count. The draft's re-read against the model caught three slips. A week label was out by one (the halls' small order came in the week of 15 February, not 22 February). The Annunciation was put in the fourth week of Lent when it falls in the third. And one line of dialogue gave a response to eight extra families that the model hadn't been run for. It was recomputed: about 56, 80 and 128 extra tins up the chain, against 56, 98 and 245 under the old rule. The dates are checked against the 2055 calendar: Easter is on 18 April, so Ash Wednesday falls on 3 March.

The story is text only for now, because the shelf's audio budget is over its cap. It was written by an AI and is fiction, not logistics or charity-management advice. The warehouse, the food bank, the parish and everyone in them are invented; Consett, Stanley and Tanfield Lea are real. Like the rest of the shelf, it is CC BY-SA 4.0. The next Hearth & Horizon proposal in the [series bible](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/hearth-and-horizon/BIBLE.md) is a contested one: does hot water freeze faster than cold on a parish car-park ice rink?

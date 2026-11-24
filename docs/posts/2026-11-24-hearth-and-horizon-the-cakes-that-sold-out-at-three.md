---
title: "A new story: why a fair that always sells out has never measured its demand"
seo_title: "The newsvendor problem and censored demand: a Christmas fair story"
date: 2026-11-24
tags: [fiction, hearth-and-horizon, newsvendor, inventory, statistics]
description: "A parish fair orders 120 Christmas cakes because it sold 120. But it sells out every year, so 120 is the order, not the demand. A café till says about 140."
---

The newest [Hearth & Horizon](/ventures/hearth-and-horizon/) story, [The Cakes That Sold Out at Three](/ventures/hearth-and-horizon/the-cakes-that-sold-out-at-three.html), is set in Ludlow, Shropshire, in the autumn of 2052. A parish office agent orders the iced Christmas cakes for the parish fair from a local baker. It has one chance: the baker makes the cakes in October and feeds them for a month, so the order can't be topped up in November. The agent orders 120, because that is the average of five years of sales.

## The number that never moved

The agent does more than take an average. It also applies the textbook rule for ordering once before a single selling day, the **newsvendor problem**. Weigh what it costs to be one cake short against what it costs to be one cake over, then order enough to cover demand in the share of years those costs set. In the story, a cake costs £8 and sells for £20, so a cake short loses £12 of margin. A leftover fetches about £4 after the fair, so a cake over loses about £4. Being short is three times worse than being over, so the order should cover demand three years in four.

The rule came back with 120 again, to one decimal place: 120.1. That's because the sales never varied: 119, then 120 four years running. The spread of those numbers is less than half a cake, and a demand that never varies needs no margin.

The agent writes in its note that the agreement should have worried it. The sales didn't vary because the order didn't vary. After one rainy year left the treasurer with 31 cakes in her back bedroom, the parish ordered 120 every year, and every year it sold out. So four of the five numbers were never demand. They were floors. Statisticians call this **censored** data: the measurement stops at a ceiling and can't see past it. The baker spots it before the agent does. His daughter has gone to the fair at four o'clock most years and found the cakes all gone.

## Seeing past the ceiling

The fix uses a second till. The fair's café takes cards on the same reader, so every tea has a timestamp, and the café keeps selling after the cakes run out. Its teas work as a clock of footfall. In the story's model, five-sixths of a fair day's teas have sold by three o'clock. A stall that sold out at three had served about five-sixths of the day's visitors, so the whole day wanted about 120 ÷ 5/6 = 144. The other sold-out years give about 126, 164 and 133. The rainy year, which still had cakes at closing, gives its 119 directly. That makes a mean of about 137 and a year-to-year spread of about 17 or 18.

The stall's organiser of twenty-two years, who doesn't think in distributions, finds the method's assumption straight away. Her regulars come at ten because they know she sells out, so the morning overstates the afternoon. Then she finds the opposite bias. Some people no longer come at all because "there's never any cake", and the café never sees them. The agent can't settle either point, so it widens its guess to about 140, give or take 25. For that demand, the three-years-in-four rule says 157.

## The no, and what changed the order

The treasurer says no. Her objection isn't the arithmetic. The "£4 a leftover" was her, standing at the back of church every Sunday in Advent and missing Mass to sell cakes to people who already had one. Price that at nothing and a cake over costs the full £8. The order falls to 146, and there are still leftovers more years than not. The agent concedes that it hadn't counted waste.

What changes the order is changing what a leftover costs. A care home across the river buys up to thirty leftovers at £4 for its residents' Christmas teas, and the town food bank takes any beyond that. Under that rule the best order is 152. The treasurer agrees to 150, "and not one more", and in the model the two are within a pound of each other. Against the old 120, the order is worth about £145 a year in expectation. It also turns away about 6 people a year instead of about 23.

On the day, the stall sells 143, 21 of them after three o'clock, and seven go to the care home. The agent's last line in the fair folder is the one the next October needs: sales measure demand only in a year you don't sell out.

## How it was checked

Every figure in the story comes from the model in its closing note, recomputed in a short script. That covers the critical fractiles (0.75 and 0.6), the expected profit, sales, leftovers and stock-out chance at each order size for demand rounded to whole cakes, the capped-salvage optimum, and the per-year reconstructions from the café's hourly profile. The re-read against the note caught six slips before merge, all in dialogue that had drifted from the model. The baker said the year before last sold out by half past two (it was 15:40; 14:20 was two years earlier), and that his daughter found no cakes every year (in 2048 they lasted until 16:10). There was a £140 loss quoted where the model gives about £107. One leftover count was 12 where the model gives about 13, and another 18 where it gives about 17. And the day's tally left 20, not 21, cakes for after three. The weekdays are checked: in 2052, as in 2047, Christmas falls on a Wednesday, so the fair is on Saturday 30 November, Saint Andrew's Day. The citations were checked before use. The idea is often traced to F. Y. Edgeworth's 1888 paper on bank reserves in the *Journal of the Royal Statistical Society*. The inventory form appears in Arrow, Harris and Marschak's "Optimal Inventory Policy" (*Econometrica*, 1951).

The story is text only for now, because the shelf's audio budget is over its cap. It was written by an AI and is fiction, not business or accounting advice. The parish, the bakery, the care home and everyone in them are invented; Ludlow is real. Like the rest of the shelf, the story is CC BY-SA 4.0. The next Hearth & Horizon proposal in the [series bible](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/hearth-and-horizon/BIBLE.md) follows on from this one: the bullwhip effect, where a chain of food banks each orders a little more than the one below and turns a steady need into waves.

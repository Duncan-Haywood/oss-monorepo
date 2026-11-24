---
title: "A new story: how many packets of an old gardener's beans bring back all 24 varieties?"
seo_title: "The coupon collector's problem in a seed library: a story"
date: 2026-11-24
tags: [fiction, hearth-and-horizon, coupon-collector, probability, seed-saving]
description: "A seed library guesses 48 packets will bring back 24 bean varieties. Equal shares need about 91; the gardener's own rows say 158. A story with its model."
---

The newest [Hearth & Horizon](/ventures/hearth-and-horizon/) story, [The Last Bean in the Tin](/ventures/hearth-and-horizon/the-last-bean-in-the-tin.html), is set in Llanidloes, a small market town on the upper Severn in mid Wales, from October 2063 to Easter 2064. An allotment holder has died at ninety-one. For sixty-four years he gave his saved bean seed away in envelopes marked only *beans*. His widow wants all 24 of his varieties back, and the parish seed library asks the town to hand in its packets. The library's agent says two a variety, 48 packets, should do it.

It is wrong, and the reason is one of the oldest results in probability.

## Why 48 is far too few

This is the **coupon collector's problem**, named after people collecting the cards that once came in tea and cigarette packets. If every packet is equally likely to be any of the 24 varieties, the first packet is always new. Once you have 12, a packet is new half the time. Once you have 23, only one packet in 24 helps, so the last variety alone takes 24 packets on average. Add up the waits and you get 24 × (1 + ½ + ⅓ + … + 1/24), about **90.6 packets**. The chance of having all 24 by packet 48 is about 1.7%.

The packets aren't equally likely, either. The gardener's notebook records how many rows he gave each variety: four favourites at six rows, twelve at two and eight at one, 56 rows in all. If he gave seed away in the same shares, nearly half the town's packets are his four favourites, and a one-row variety turns up about once in 56 packets. With those shares the expected number of packets to collect all 24 is about **158**. A simulation of 20,000 runs agrees: a mean of 159 and a median of 145.

## Knowing what you're missing

The story's second problem is sorting. Eight of the 24 varieties are white or brown beans that look alike as dry seed. Until they are grown, nobody knows which white ones the library has, so it can only ask for "more white beans". Those will mostly be the common one again. The widow says no to growing them before May. She has a point: bean seed loses viability after a few years in a drawer, and some packets hold only eight seeds. The compromise is three seeds from each look-alike packet, in trays under the library's grow-lamps in January. By March the plants have sorted themselves by habit, pod and flower colour.

That changes the collecting. With the missing beans named and described ("the little white one like rice", "the white climber with the yellow pod"), the library stops collecting at random. At Easter, after 100 packets, it has 22 of the 24. The model says that if packets went on arriving at random, the next of the two missing varieties would take about 28 more packets and both about 84. The town may not have either any more.

## How it was checked

All the counts in the story come from one fixed pseudo-random draw of 100 packets from the notebook shares, given in the closing note so a reader can redo it. It happens to sit close to the averages: 18 varieties after 48 packets against an expected 18.5, and 22.4 expected after 100. The re-read against the model caught three slips before merging. The first draft named a variety as arriving in October when the draw first produces it at packet 33. It also gave the allotment fifty-one years when the wedding scene needs sixty-five, and called an average "the most likely number". All the dates were checked against the 2063 and 2064 calendars. Easter 2064 falls on 6 April, and the Epiphany, kept on a Sunday in England and Wales, falls on 6 January.

The story is text only for now, because the shelf's audio budget is over its cap. It was written by an AI and is fiction, not seed-saving or statistical advice. The people, the parish and the beans are invented. Llanidloes and the villages around it are real. Like the rest of the shelf, it is CC BY-SA 4.0. The next proposal in the [series bible](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/hearth-and-horizon/BIBLE.md) is about a parish choir whose agent gives the psalm to whoever has sung it most. It's a Pólya urn, and it shows how a small early lead turns into the whole rota.

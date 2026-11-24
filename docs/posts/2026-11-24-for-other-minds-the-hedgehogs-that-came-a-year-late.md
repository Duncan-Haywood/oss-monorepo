---
title: "A new story: hedgehog houses, slug traps and why one good year proves nothing"
seo_title: "Lotka-Volterra in a parish garden: hedgehogs, slugs, one good year"
date: 2026-11-24
tags: [fiction, for-other-minds, lotka-volterra, predator-prey, ecology, statistics]
description: "Hedgehog prints nearly double and slugs nearly halve the year after the houses go up. The founder's diary shows the same jump five years earlier, without them."
---

The newest [For Other Minds](/ventures/hearth-and-horizon/) story, [The Hedgehogs That Came a Year Late](/ventures/hearth-and-horizon/the-hedgehogs-that-came-a-year-late.html), is set in a parish garden in Hexham, Northumberland, from 2054 to 2057. Every June since 2047 the garden has run the same count: six footprint tunnels along the hedge for five nights, which gives thirty tunnel-nights, and five beer traps in the beds. In November 2054 the confirmation class builds five hedgehog houses, and the committee gives up slug pellets at the same meeting. The next June, prints are up from 12 nights to 23 and slugs are down from 26.0 a trap a night to 13.8. Asked whether the houses worked, the garden's agent says yes.

A year later both counts fall: prints to 16, slugs to 5.9. The committee wants to know what went wrong.

## Two numbers out of ten

What went wrong was the answer. The agent had ten years of counts in the founder's diary and compared two of them. Laid out in full, the diary shows the same jump in 2049 to 2050: prints from 14 to 23 and slugs from 26.0 to 11.5. In 2051 came the same fall, to 15 and 5.7. That was five years before the houses were built.

The two counts go round in a cycle. Slugs peak, hedgehogs peak a little after, the slugs are eaten down, the hedgehogs go hungry and fall, and the slugs come back. That is the predator-prey model Alfred Lotka (1925) and Vito Volterra (1926) wrote down independently. Volterra was prompted by his son-in-law Umberto D'Ancona's finding that the share of predatory fish in Adriatic market catches rose during the First World War, when fishing fell. The story states the model exactly:

dS/dt = aS − bSH, dH/dt = cSH − dH, with a = 1.6, b = 0.12, c = 0.075 and d = 1.0, started at 8 and 8 in June 2047.

In that model the cycle takes about 5.16 years, and each hedgehog peak comes about 0.94 years (eleven months) after the slug peak. Every number a character says comes from integrating it: the ten Junes in the diary, the forecasts of about 9 prints in 2057, 7 in 2058 and slugs back to about 25 in 2059.

## A caricature, and the agent says so

The story is careful about what the model can't carry. Hedgehogs eat beetles, caterpillars and earthworms as much as slugs. They also walk a mile or more in a night, so the prints in one garden's tunnels come from the town's hedgehogs, not the garden's own. The agent can say that the counts cycle. It can't say that the slugs are what turns them. A wet spring every few years could do it too. The story doesn't claim anyone has published a hedgehog-slug cycle.

The test it can run is to compare with other gardens. The primary school and the allotments down the hill run the same tunnels in the same week, and neither has a hedgehog house. Their prints went 9, 16, 11 and 10, 20, 14 over 2054 to 2056, the same shape as the garden's. So the houses didn't cause the good year. Whether they help at all is still open. The garden's best print June was 23 nights in 2050 and 23 again in 2055, and the classic model's cycles repeat at the same height whatever the houses do. One garden would need several turns of the cycle to tell, or many gardens with houses and many without.

## The no

The reasonable no comes from Bernard. His late wife started the garden. He gave up his pellets for the houses, and he won't lose the 2059 lettuces to a drawing. The agent doesn't argue for or against pellets, because that rule belongs to the committee. It shows him what the chart can see. The slugs were 26 a trap a night in 2049, when the founder never used pellets, and 26 again in 2054, when he did. The traps can't see his beds. He asks for the school's counts and the allotments', and after he has seen them he puts the decision off to 2058. The newsletter prints a correction under the garden's own name.

## How it was checked

The model was integrated by fourth-order Runge-Kutta in steps of 0.0005 years. The June values, the peak times and heights, the period and the lag were all read from that run, and the dialogue was checked against them line by line. The 2057 count in the story (7.4 slugs and 10 prints) has some invented scatter added, against the model's 6.6 and 9, and the closing note says so. The neighbours' counts are the model's values scaled by 0.7 and 0.85. Every weekday was computed: the house-building on Saturday 14 November 2054, the first Mondays of June, and the committee's second Tuesdays of July. The re-read before merging fixed four slips. One was a pellet timeline that contradicted itself. One said the agent had ten Junes in 2055, when it had nine. One called December 2048 a "2049 peak" (the story now says "the highest slug June"). One said a model from 1925 was "about a hundred years old" in 2056.

The story is text only for now, because the shelf's audio budget is over its cap. It was written by an AI and is fiction, not ecological, gardening or pest-control advice. Every person, the garden and its agent are invented. It is CC BY-SA 4.0, like the rest of the shelf. The next For Other Minds proposal in the [series bible](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/hearth-and-horizon/BIBLE.md) is gambler's ruin: a food bank whose donations average exactly its spending, and whose reserve still runs dry.

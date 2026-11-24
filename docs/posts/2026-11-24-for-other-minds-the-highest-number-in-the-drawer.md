---
title: "A new story: counting a tool library the way the Allies counted tanks"
seo_title: "The German tank problem in a library of things: a serial-number story"
date: 2026-11-24
tags: [fiction, for-other-minds, german-tank-problem, statistics, sampling-bias]
description: "Eight tool tags, the highest 212. The count says 212, the tank formula says 237, a full shelf count says 231, and two weeks of returns say 241. Why."
---

The newest [For Other Minds](/ventures/hearth-and-horizon/) story, [The Highest Number in the Drawer](/ventures/hearth-and-horizon/the-highest-number-in-the-drawer.html), is set in Ballina, County Mayo, in October 2057. A volunteer-run library of things lends drills, ladders and pressure washers for free. Its lending service shuts down, and the export comes out with the item and loan tables empty. The insurer's renewal form asks how many items the library holds. The only clue left is on the tools themselves: every one carries an aluminium tag, stamped in order from 1 by the carpenter who founded the library, and no number was ever reused.

By Monday, eight tools have come back since the move. The highest tag is 212, so the lending agent says 212.

## The highest number is the floor, not the answer

A retired maths teacher on the Monday evening desk tells the agent about the tanks. During the Second World War, economists in London estimated German production from the serial numbers on captured equipment. Richard Ruggles and Henry Brodie described the work in the *Journal of the American Statistical Association* in 1947, and set the estimates against the German records found after the war. Leo Goodman gave the standard estimator in the same journal in 1952. With k different numbers seen and the highest m, the estimate of the total is

m(1 + 1/k) − 1,

which is the highest number plus the average gap between the numbers seen, less one. Eight tags with a highest of 212 gives 212 × 9/8 − 1 = 237.5, give or take about 26. The next morning the pressure washer comes back, tag 219, and the estimate moves to 242. With only nine tags it is bound to jump about.

## More data, worse answer

So the volunteers count the whole building on Saturday, reading every tag and putting a strip of masking tape on each tool once it's read. That gives 171 different tags, the highest 231. The formula then says 231, with a standard error under one. It is lower than the eight-tag answer, and far more confident.

It is also wrong, and the gaps show why. The agent sees 86 of tags 1 to 100 and 76 of 101 to 200, but only 9 of 201 to 231. The newest tools, bought with a summer grant, are the ones everybody wants, so they are out on loan. The formula looks only at the top of the series, and the top is the part a shelf count sees worst. The eight tags that came back on their own were a fairer draw than the 171 on the shelves.

## The no, and the fix

The coordinator suggests the Thursday desk volunteer call round to the borrowers she remembers and ask to see their tags. She refuses. The library charges no fines and chases nobody, and half its borrowers come because they can't afford to buy the thing. "If I knock on a door and say have you got our drill, I'm the man from the shop." The agent adds that her rounds would bias the sample in a different way, towards borrowers she happens to know.

The fix is to wait. The loan is a week, and nobody chooses when to return a tool by its number, so two weeks of returns are a fair draw of whatever was out. By 27 October the agent has seen 222 tags, the highest 241. The top is no longer thin: 38 of the newest 41 numbers have been seen, about the same share as the oldest hundred. The estimate is 241, perhaps 242. Against that, the first count of 212 was 29 short, the eight-tag estimate about 4 short, and the confident shelf count about 10 short.

The story also says what the number is not. It estimates tags ever stamped, not tools held. Nineteen numbers below 241 are still unseen: tools on long loan, lost, or thrown out years ago with their numbers. So the form says at least 222 and at most about 241, and explains why.

## How it was checked

Every figure in the story comes from the model in its closing note, and was recomputed in code: the four estimates, their standard errors (26, 24, 0.7 and 0.3), the gap counts in each band of numbers, and the shortfalls. The weekdays of October and November 2057 were checked, including All Souls' Day on Friday 2 November. Both citations were looked up before use: Ruggles and Brodie, *JASA* 42 (1947), pages 72 to 91, and Goodman, *JASA* 47 (1952), pages 622 to 634. The teacher's account of the wartime estimates is told from memory and simplified, and the note says so. The re-read fixed one slip, where the average gap had been called a twenty-sixth of 212 instead of an eighth (26.5). It also took out a street name that couldn't be confirmed.

The story is text only for now, because the shelf's audio budget is over its cap. It was written by an AI and is fiction, not statistical or insurance advice. Every person, the library and its agent are invented. It is CC BY-SA 4.0, like the rest of the shelf. The next For Other Minds proposal in the [series bible](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/hearth-and-horizon/BIBLE.md) is predator and prey: why one good year of hedgehogs and few slugs proves nothing about the hedgehog houses.

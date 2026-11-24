---
title: "A new story: a food bank's reserve that balanced on average and still ran dry"
seo_title: "Gambler's ruin at a food bank: why a balanced reserve runs dry"
date: 2026-11-24
tags: [fiction, for-other-minds, gamblers-ruin, random-walk, statistics, charity]
description: "Giving averages exactly what the weekly shop costs, so the agent calls the £1,800 reserve safe. A walk with no drift and a floor at nought finds the floor."
---

The newest [For Other Minds](/ventures/hearth-and-horizon/) story, [The Reserve That Went to Nought on a Tuesday](/ventures/hearth-and-horizon/the-reserve-that-went-to-nought-on-a-tuesday.html), is set in a food bank in Brigg, North Lincolnshire, from September 2053 to Easter 2055. The food bank has a cash reserve of £1,800. Each week about £640 comes in, and the Tuesday shop at the cash-and-carry costs £640. The treasurer asks the food bank's agent whether they are eating the reserve. The agent says no: on average it neither grows nor shrinks, so it is safe.

Sixteen months later the account holds £491 on a Tuesday morning, the list is £640, and the card is declined at the till with a full trolley.

## The right average, the wrong question

The agent's average was right. What it missed is that "safe" is a question about a floor, and an average can't answer it. Each week's cash in was £640 *on average*, with a scatter (standard deviation) of about £220. So the reserve took a random step every Tuesday. A walk with no drift doesn't stay where it starts. The typical distance it has wandered grows with the square root of the number of steps: after a year, about £220 × √52 ≈ £1,600, nearly the whole reserve. The walk can't go below nought, and it has no ceiling, so in the end it hits the floor.

This is the old problem of the gambler's ruin. Pascal posed it to Fermat in 1656, and Huygens printed it at the end of his 1657 book on games of chance. For a fair walk started at k with barriers at 0 and N, the chance of reaching 0 first is 1 − k/N. Take the ceiling away and that chance is 1. The expected time to get there is infinite, but the walk still gets there.

The story's numbers come from a simulation of 200,000 food banks, each with £1,800 and that scatter. The chance of a short Tuesday was 23% within one year, 49% within three, 59% within five and 70% within ten. Half had one within 168 weeks.

## The no, and what was left

The obvious fix is a bigger reserve. Getting the one-year chance down to about 5% needs about £3,000. The treasurer refuses to go back to people who are already giving more than they can spare and tell them it isn't enough. In the story that is a reasonable no.

So the agent works on the scatter instead of the mean. The cash came from two places. The collecting boxes and the supermarket trolley brought about £380 a week, with a scatter of about £130. Fourteen regular givers brought about £260 a week, with a scatter of about £178, because they gave in lumps: an Easter cheque, a pension every four weeks. The regulars were about two-fifths of the money but about two-thirds of the variance. Asking them to give the same total as a weekly standing order isn't asking for more, and it cuts the weekly scatter from £220 to about £130.

A smaller scatter only slows the walk down. To keep a walk off the floor it has to lean away from the floor when it gets near. So the food bank adds a short list: when the reserve is under £700 on Monday night, Tuesday's shop is £80 smaller. The line is set from the scatter, £220 × √10 ≈ £700, not from the mean. That has a cost, and the story counts it: fewer eggs and less milk in forty or fifty bags in every week the short list runs. Starting from nought, that is about sixteen weeks in the first year and three or four a year after that.

Each change on its own, from the original £1,800:

| | within 1 year | within 5 years |
|---|---|---|
| as it was | 23% | 59% |
| standing orders only | 5% | 37% |
| short list only | 8% | 29% |
| both | 0.1% | 0.6% |

From where the food bank actually stood, at nought, both changes together still leave about a four-in-ten chance of another short Tuesday within a year, nearly all of it in the first weeks. The expected number of short Tuesdays over five years falls from about seventeen to about two-thirds of one.

## How it was checked

Every figure a character says came out of the simulation code, not out of the draft. The reserve's path from September 2053 to January 2055 is a single draw from the first model, and the path from January to Easter 2055 is a single draw from the last. The closing note gives both, along with the seeds and how they were chosen. Every weekday was computed. Easter 2055 is 18 April, so the first full list after the short-list weeks falls on Easter Tuesday. The re-read before merging fixed three slips. The draft called the week's cash in £491 when that was the account balance (the cash in was £458). It called 6 April 2055 "the Tuesday after Palm Sunday" when it is the Tuesday before. And it put a mid-March week at "the start of March".

The story is text only for now, because the shelf's audio budget is over its cap. It was written by an AI and is fiction, not financial or charity-governance advice. The people, the food bank and its agent are invented; Brigg is real. It is CC BY-SA 4.0, like the rest of the shelf. The next For Other Minds proposal in the [series bible](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/hearth-and-horizon/BIBLE.md) is the clustering illusion: three falls on one church step in a fortnight, and whether a run like that needs a cause.

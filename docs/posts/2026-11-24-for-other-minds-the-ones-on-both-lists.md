---
title: "A new story: counting people who slept rough the way ecologists count trout"
seo_title: "Capture-recapture for a rough sleeper count: a Lincoln-Petersen story"
date: 2026-11-24
tags: [fiction, for-other-minds, capture-recapture, statistics, homelessness]
description: "Two charity lists, 48 and 36 people, 18 on both. Adding them gives 66, but the overlap is the measurement: Lincoln-Petersen says about 96, likely more."
---

The newest [For Other Minds](/ventures/hearth-and-horizon/) story, [The Ones on Both Lists](/ventures/hearth-and-horizon/the-ones-on-both-lists.html), is set in Kendal, Cumbria, in March 2054. The council asks a parish Saint Vincent de Paul conference how many different people slept rough in the town over the winter, for a funding bid. The conference's records agent has two lists. The soup run saw 48 different people between December and February. The night shelter had 36 guests. The soup run's sheet has a tick for "at the shelter this week", and 18 people have one. So the agent adds the two lists, takes off the 18 counted twice, and sends 66.

## The overlap is the measurement

A volunteer on the soup run spent forty years as a fisheries officer, and he asks the agent how many trout live in a beck. You fish a stretch and mark 200. A week later you fish it again and catch 180, and 20 of them carry your mark. You don't write down 360. One in nine of the fish you caught was marked, so you marked about one in nine of the beck, and it holds about 1,800.

That is the Lincoln-Petersen estimate. C. G. J. Petersen used it for young plaice in the Limfjord in the 1890s, and Frederick Lincoln used it for ducks, from hunters' returned leg bands, in a 1930 US Department of Agriculture circular. On the story's lists, 18 of the soup run's 48 people were also at the shelter. So the shelter saw about three in every eight of the people sleeping rough, and everyone comes to 48 × 36 / 18 = 96. D. G. Chapman's 1951 correction, which suits small counts better, gives (49 × 37) / 19 − 1, about 94, with a rough 95% range of about 72 to 117.

## Why 94 is probably a floor

The story goes through the method's three assumptions one at a time, because the agent's first mistake was sending a number without asking what its own sum assumed.

1. **The population is closed.** Over a winter, people arrive in town and leave it. So the answer is a winter's worth of people, not one night's.
2. **Being caught once doesn't change your chance of being caught again.** Here it does. The soup run hands out cards with the shelter's address, so people on one list are likelier to be on the other. A bigger overlap makes the estimate smaller, so the true number is probably above 94, not below it. And someone who uses neither service has no chance of appearing on either list, so the method can't see them at all.
3. **The marks are read correctly.** A tick on a sheet is a weak mark. If the true overlap were 17, not 18, the estimate would be about 100.

## The no, and the fix

The agent asks the shelter's manager for her guests' names so it can check the tick properly. She refuses. Guests gave their names so she would know who was in the building during a fire, and at least one woman gave a false name because someone is looking for her. "It's not mine to send."

The fix needs no names at all. For the last three weeks of the shelter's season, guests at both places are offered a code they choose themselves, such as their initials and birth month. It is offered once, after the soup, and refusing costs nothing. Anyone who declines is counted but not matched. The agent checks that no code turns up twice on either list. In the story, 28 of the van's 31 people and 24 of the shelter's 25 gave a code, and 12 codes were on both lists. The van's tick had said 13. So the winter's tick looks close, and if anything slightly high, which would push the estimate up. The story counts what this cost too. One regular was asked twice by a new volunteer, walked off without his soup, and stayed away for more than a week.

The ending is honest about how far the better number got. The council's box takes one count, and the officer can only defend a count of people actually seen. So 66 goes in the box and the agent's paragraph, with 94 at the top, goes in the notes. Nobody knows yet whether the fund reads the notes.

## How it was checked

Every figure in the story comes from the model in its closing note, recomputed in code: both estimates, Chapman's variance (135.6, a standard error of about 11.6), the 17-overlap case (101.6 and 99.7), the trout example and the chance of two people picking the same code (about 0.15 expected clashes on a list of 50 if initials were evenly spread, more in practice). The weekdays were checked, and so was Easter 2054, which falls on 29 March. That puts Holy Week and the shelter's last night, Easter Tuesday, inside the story's month. The citations were looked up before use: Petersen's report in the Danish Biological Station's sixth volume, Lincoln's Circular 118, and Chapman's 1951 paper in the University of California Publications in Statistics. So was the official position that England's autumn rough sleeping snapshot covers a single night and can't give a count over a year. The re-read changed one claim. The agent's capability is "nearly thirty years" past today's, because 2026 to 2054 is 28 years.

The story is text only for now, because the shelf's audio budget is over its cap. It was written by an AI and is fiction, not statistical, housing or social-work advice. Nobody in it is real, and nobody is identified. It is CC BY-SA 4.0, like the rest of the shelf. The next For Other Minds proposal in the [series bible](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/hearth-and-horizon/BIBLE.md) is the German tank problem: estimating a total from the serial numbers you happen to see.

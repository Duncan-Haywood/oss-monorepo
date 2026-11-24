---
title: "A new story: a choir let its agent draw the cantor by experience, and two singers took 44 of 53 Sundays"
seo_title: "The Pólya urn and the Matthew effect in a parish choir: a story"
date: 2026-11-24
tags: [fiction, hearth-and-horizon, polya-urn, matthew-effect, probability]
description: "A choir weights its cantor draw by how often each singer has sung. Two take 44 of 53 Sundays and a 31-year cantor gets none. A Pólya urn story, with its model."
---

The newest [Hearth & Horizon](/ventures/hearth-and-horizon/) story, [The Psalm That Went to Whoever Had Sung It Most](/ventures/hearth-and-horizon/the-psalm-that-went-to-whoever-had-sung-it-most.html), is set in the choir gallery of an invented parish in Kilrush, County Clare, from November 2073 to the Sunday after Easter 2074. The choir director has been accused of favourites, so she asks the parish agent to draw the Sunday cantor by lot. She adds one condition: experience should count, so whoever has sung the psalm more this year gets more chances. Everyone starts with one ticket, and each time a name is drawn it gets another.

A year later two of the six sopranos have sung 44 of the 53 Sundays. A woman who has cantored for thirty-one years has sung none.

## Why the draw locks in

The rule is a **Pólya urn**, named for George Pólya, who studied it with Florian Eggenberger in 1923 as a model of contagion. Draw a ball, put it back with another of the same colour, repeat. It does not reward skill. It rewards whoever got lucky first. In the story's draw one singer comes up on the first Sunday of Advent, and then on six Sundays running from New Year. By early February she holds 9 of the 17 tickets, and the luck stops mattering.

The surprising part is how wide the outcomes are. With two singers starting at one ticket each, after 52 Sundays every split is equally likely: 26 to 26 has the same chance as 52 to nothing, one in 53 each. With six singers there's about one chance in five that a single singer ends up with more than half the Sundays for good. The story's agent replays the year's rule 200,000 times, with the newcomer who joined in September. In 43.5% of years at least one of the original six never sings at all. Under a plain lot with no weights that happens about five times in ten thousand.

The sociologist Robert Merton called the same pattern in science the **Matthew effect** (*Science*, 1968), after Matthew 25:29: "unto every one that hath shall be given". In the story the parish priest points out that the verse closes the parable of the talents, where every servant is given something before anyone is judged on it. That's his reading, and the story leaves it as his.

## The fix, and who pays for it

The fix is a plain rota, with every name rehearsing on the Thursday before. Experience counts only in the order: the longest-serving singer goes first. Seven names over 52 Sundays means seven or eight each. The two singers who had 26 and 18 Sundays go to eight each, losing 28 Sundays between them. One of them says so in the car park, and the story doesn't pretend it costs her nothing.

The rota also puts Easter Day on a sixteen-year-old who has never sung a psalm in church. The director says no, which is the reasonable "no" every story on this shelf needs. Easter morning is full of visitors, and a first psalm shouldn't be sung in front of them. The long-serving cantor offers to swap, which leaves every total unchanged.

## How it was checked

Every count in the story comes from one fixed pseudo-random draw from the rule (seed 1521), and the closing note gives its Sunday-by-Sunday results so a reader can redo them. The re-read against that draw caught four slips before merging. The first draft gave the leading singer 9 of 15 tickets in mid-February; the draw says 9 of 17 on 5 February. It also had "more than forty tickets" by the start of summer, which is only true from late July. The newcomer's second Sunday was put at the end of February when the rota gives her 4 March, and a swap was described against the wrong Sunday. All dates were checked against the 2072 to 2074 calendars. Christmas 2072 falls on a Sunday, Easter 2074 on 15 April, and the year from Advent 2073 is lectionary Year A. Psalm 118, with the verse about the stone the builders rejected, is sung on both Easter Sunday and the Sunday after.

The story is text only for now, because the shelf's audio budget is over its cap. It was written by an AI and is fiction, not music-ministry or statistical advice. The people and the parish are invented; Kilrush is real. Like the rest of the shelf, it is CC BY-SA 4.0. The shelf's list of ideas had run dry, so the [series bible](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/hearth-and-horizon/BIBLE.md) now has a new one: an apprenticeship scheme in a harbour town that places school-leavers by first-come offers and then by Gale and Shapley's deferred acceptance.

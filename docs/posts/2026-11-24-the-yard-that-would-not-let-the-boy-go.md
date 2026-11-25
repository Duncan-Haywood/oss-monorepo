---
title: "A new story: eight apprentices, eight employers, and the one move deferred acceptance can't stop"
seo_title: "Gale-Shapley stable matching in an Orkney harbour town: a story"
date: 2026-11-24
tags: [fiction, hearth-and-horizon, stable-matching, deferred-acceptance, gale-shapley, market-design]
description: "First-come offers leave three blocking pairs in an Orkney apprentice scheme. Deferred acceptance fixes it, but a one-name list still wins. A story and model."
---

The newest [Hearth & Horizon](/ventures/hearth-and-horizon/) story, [The Yard That Would Not Let the Boy Go](/ventures/hearth-and-horizon/the-yard-that-would-not-let-the-boy-go.html), is set in Stromness, Orkney, in 2064 and 2065. A retired guidance teacher starts an apprenticeship scheme: eight school-leavers, eight places around the harbour (two boatyards, a shellfish plant, a smokehouse, a dive firm, a hatchery and two farms). In the first year employers make offers when they're ready, and the young people answer by the next morning, the way jobs have always been got in the town.

By Lent the scheme has a problem it can name. Three pairs, an apprentice and an employer, would both rather have each other than the match they got. One of those pairs has already acted on it: two boys quietly swapped employers in January.

## What the first year got wrong

The name for such a pair is a **blocking pair**, and a placement with none is **stable**. Under first come, first served, the employers who offered earliest got their first choice and can't be in a blocking pair. The cost falls on the apprentices who said yes early, before the employer they really wanted had made an offer. In the story's lists both January acceptances end up in blocking pairs.

The scheme's agent replays the same lists through **deferred acceptance**, the method from David Gale and Lloyd Shapley's 1962 paper "College Admissions and the Stability of Marriage". Everyone hands in a whole ranked list. Each apprentice asks their first choice. Each employer holds the best applicant so far, without saying yes, and turns the rest away. Anyone turned away asks their next choice. The result: seven of the eight get their first choice, nobody is in a blocking pair, and for those lists there is only one stable placement. That was checked by trying all 40,320 ways to pair eight with eight.

## The second year, and who pays

In year two the scheme runs deferred acceptance with the apprentices proposing. This time the lists allow two stable placements, and they differ for four apprentices and four employers. With apprentices proposing, those four apprentices get their first choice and those four employers their second. With employers proposing it's the other way round. Gale and Shapley proved that the proposing side always gets its best stable outcome and the other side its worst. So the coordinator stands up at a meeting and tells the four employers that the scheme chose against them, and why.

## The one move that still works

The part of the theory the story turns on comes later. Dubins and Freedman (1981) and Roth (1982) proved that **no apprentice can do better by handing in a false list** when apprentices propose. Roth also proved that no stable method can be safe from false lists on both sides at once. An employer can sometimes win by leaving names off its list.

So when the old boatbuilder won't rank anyone, because he promised his dying friend a place for his son, and the coordinator says "then put one name down", she has agreed to the one strategy that can beat the method. Under the story's lists it does. The boy has put the hatchery first and the yard second. With only his name on the yard's list, the girl who put the yard first is turned away and goes to the smokehouse. That bumps a boy to the dive firm, which bumps a girl to the hatchery, which bumps the son to the yard. The yard gets the boy, and four people, him included, get their second choice instead of their first. Nobody can check a list against what its writer really wants. The story is about what the people involved do about that.

## How it was checked

The closing note gives every first choice and the order of the first-year offers, so a reader can redo the matching by hand. A short script computed the first-come result, the blocking pairs before and after the swap, both deferred-acceptance results, the full count of stable matchings for both years, and the one-name chain. Every date was checked against the 2064 and 2065 calendars. Easter 2065 is 29 March. 19 March, Saint Joseph's day, is a Thursday, and so is 16 April, Saint Magnus's day. 1 May, Saint Joseph the Worker, is a Friday.

The adversarial re-read before merging fixed five things. The first draft said seven employers got exactly one first-round proposal; the lists give six, one with two and one with none. It called the 1962 paper ten pages long; it runs from page 9 to page 15. It had an employer saying she would have ranked differently, which muddied the point that lists are taken as true. The coordinator's own reasoning about the one-name list had a step that didn't follow. And the yole was planked on its frames, but a clinker yole is planked over moulds and framed afterwards.

The story is text only for now, because the shelves' audio is over its size cap. It was written by an AI and is fiction, not careers or employment advice. The people, the scheme and the businesses are invented; Stromness is real. Like the rest of the shelf, it is CC BY-SA 4.0. The shelf's list of ideas was empty again, so the [series bible](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/hearth-and-horizon/BIBLE.md) has a new proposal with its numbers worked out: Buffon's needle on a vestry floor, and Lazzarini's 1901 result that was too good to be true.

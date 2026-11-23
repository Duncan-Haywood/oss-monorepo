---
title: "A new story: why four priests' worth of work needs six priests"
seo_title: "Erlang C and the rush after the homily, worked on a penance service"
date: 2026-11-23
tags: [fiction, hearth-and-horizon, science-fiction, queueing, erlang]
description: "An Iowa deanery's agent plans a penance service at exactly full load. Erlang's 1917 formula says why that fails, and the door count says the average hid a rush."
---

The newest [Hearth & Horizon](/ventures/hearth-and-horizon/) story, [The Fifth Priest](/ventures/hearth-and-horizon/the-fifth-priest.html), is set in Carroll County, Iowa, in Advent 2053. A deanery of fourteen parishes and nine priests holds its Advent penance services, and its calendar agent is asked how many priests to invite.

It divides. Last year a hundred people came forward over a hundred minutes. The priests say a confession takes about four minutes. Sixty an hour at four minutes each is four priests' worth of work, so it asks for four.

The service runs to twenty-four minutes past nine with a line down the side aisle, and four people from the care-home bus go home without reaching a priest.

## Full load never settles

The first thing queueing theory says is that a line planned at exactly full load has no steady state. A. K. Erlang worked this out in 1917 for the Copenhagen Telephone Company: with random arrivals and random service times, a switchboard with exactly enough operators for the average has a queue that wanders without limit. You need spare capacity, and his delay formula (now called Erlang C) says how much.

For 60 an hour at 4 minutes each (a load of 4 erlangs), if people came steadily and at random:

| Priests | Chance a person waits | Mean wait |
|---|---|---|
| 4 | no steady state | grows without limit |
| 5 | 55% | 2.2 minutes |
| 6 | 28% | 0.6 minutes |
| 7 | 14% | 0.2 minutes |

## The average was true and it was not what happened

People do not come steadily. In the story, seventy of the hundred join a line in the twenty minutes after the homily. That is three and a half a minute, which at four minutes each is fourteen priests' worth of work. Erlang's formula assumes a steady average rate, so the story's later numbers come from simulating a thousand-odd evenings with that rush and tail:

| Plan | Mean wait | Longest wait |
|---|---|---|
| 4 priests, everyone after the homily | about 24 min | about 48 min |
| 6 priests, everyone after the homily | about 10 min | about 25 min |
| 3 priests from 6:15 for early comers, then 6 | about 4 min | about 13 min |

More priests help. Spreading the rush helps more. And people only come early, as the retired monsignor in the story says, "because they know the light is on".

## What the story will not trade

The tempting fix is to shorten the four minutes. The parish priest says no: a penance service is not a supermarket, and nobody is to be hurried. The agent agrees, and goes further: it has never had a time for any confession, counts only heads joining a line, and wants to keep it that way. The seal of confession is untouched; the cost of the fix is paid elsewhere, in two parishes' evening Masses moved to the morning, and one laundry worker who cannot come at eight.

The story's closing note gives the full model (arrival pattern, service distribution, number of simulated evenings) so a reader can check every figure. Like every Hearth & Horizon story, it was written by an AI, is fiction, and is CC BY-SA 4.0. This one is text only for now: the shelf's audio budget is spent until the enclosures move off Pages.

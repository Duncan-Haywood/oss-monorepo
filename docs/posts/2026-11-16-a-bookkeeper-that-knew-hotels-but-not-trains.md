---
title: "The bookkeeper knew hotels but not trains"
date: 2026-11-16
description: "We added 1,193 public transport networks from OpenStreetMap to an open-source categorizer. It fixed one held-out line and broke none. Here is why so few."
tags: [ai-bookkeeper, evaluation, openstreetmap, categorization]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) suggests an account for each bank or card line. On a brand-new set of books it has nothing it learned from you, so it leans on lists. One of those lists is about 6,600 chain names from OpenStreetMap's [name-suggestion-index](https://github.com/osmlab/name-suggestion-index): Heron Foods is a grocer, Candlewood Suites is a hotel, O'Reilly sells car parts.

That list knew hotels and car hire as travel. It knew no railways, bus companies or ferries. On a US nonprofit's public ledger, the first fare to the Long Island Rail Road got the guess "meals", because the books' other new payees mostly went there.

## What we added

The same index also lists the network and operator of every bus, train, metro, tram and ferry route mapped in OpenStreetMap. We wrote the rule from the index itself, before scoring any bank line:

- **The name has to say it is transport.** It needs a word like transit, metro, rail, bus, tram, ferry or coach (and the German, Italian, Dutch, Czech and Polish forms). Many network tags are a bare place ("Renfrewshire", "Isle of Wight") or initials ("STAS"). A bank line that starts with a place name is a council payment as often as a fare.
- **Departments don't count.** "King County Metro" is a fare. "Maine Department of Transportation" is a permit or a toll.
- **Track owners don't sell tickets.** Network Rail was taken out, because a business that pays it is paying for access or land.

That added 1,193 names. No existing chain lost its account, and building with `--no-transit` gives back yesterday's file byte for byte.

## What it changed

We scored the old and new lists on every labelled set this session could reach:

| set | before | after |
|---|---|---|
| Hack Club ledger, first-time payees (held out, 185) | 54.1% right / 25.9% wrong | 55.1% / 25.4% |
| Mint exports, YNAB households, a Chase card, makerspace bank files | | unchanged |
| Scottish Government card lines (11,087) | | unchanged |

It changed one line, the Long Island Rail Road fare, and it changed nothing else.

## Why so little

Fares are rare in these files, and when they do show up they rarely use a network's full name. The Scottish file lists only spending over £500, which leaves out train tickets. In the households' Mint exports, fares read "MTA" or "Clipper Service Ca": initials and fare-card names, which the transport-word rule skips on purpose. The files where fares are common, city and council card lines from Toronto and Durham, could not be downloaded from this session, so they were not rescored.

We did not add Hack Club's other missed fares (Bolt Bus, Concord Coach Lines, the AirTrain) by hand. That ledger is held out, and fixing its misses would only make the next score look better than it is.

So the honest summary is a small, clean gain. On a city's card file this layer should do more, and that is the next set to run it on.

---
title: "Why a new fuse board trips on wet mornings when the old one never did"
seo_title: "Earth leakage and RCD tripping on damp mornings, told as a story"
date: 2026-11-18
tags: [hearth-and-horizon, stories, science-fiction, electricity]
description: "A new Hearth & Horizon story adds up a building's earth leakage: 7.9 mA on a dry morning, 22.3 mA on a wet one, against a switch that may trip from 15 mA."
---

[Hearth & Horizon](https://marisstella.app/hearth-and-horizon/) has a new story: [*The Wet-Morning Trip*](https://marisstella.app/hearth-and-horizon/the-wet-morning-trip.html). It runs about 5,400 words. It is set in 2047, in an invented parish in Bethesda, a slate town in north Wales. The parish's food cupboard runs from an old coach house. Since a rewire in the summer, its power goes off at a quarter to seven on wet mornings, when a timer brings on a water heater and a convector heater together.

## The switch that only counts

A residual-current device (RCD) does one thing. It compares the current going out on the line wire with the current coming back on the neutral. If some is missing, it has gone home another way: down the earth wire, through damp, or through a person. Under BS EN 61008-1, a 30 mA device must trip at 30 mA and must not trip at 15 mA. Between the two, any given device can trip wherever it likes. The two devices in the story ramp-test at 19 and 21 mA, both inside that band.

An old fuse board has nothing like this. A fuse blows on amps, enough current to cook a cable. Milliamps going to earth pass it unseen. So "the old board never tripped" is true, and it tells you nothing about the building.

## Adding up the leaks

Everything leaks a little. The story's building, with two chest freezers, a fridge, a computer, a router, LED lights and the cables, leaks 3.1 mA at rest. Those figures are assumptions, chosen to be ordinary. The UK wiring regulations (BS 7671:2018) advise keeping the standing leakage on one RCD under 30% of its rating, which is 9 mA for a 30 mA device.

The water heater's element is a copper tube packed with magnesium oxide powder, which soaks up moisture. Moisture gets in at the old seal where the wires enter. The electrician's insulation tester reads 14 kΩ on the wet morning. At 230 V that is about 16.4 mA going to earth. On a dry morning it reads 59 kΩ, or 3.9 mA. With the convector added:

- **Dry:** 3.1 + 3.9 + 0.9 = 7.9 mA. Under the 9 mA advice, just.
- **Wet:** 3.1 + 16.4 + 2.8 = 22.3 mA. Over both devices' trip points.
- **Middling:** about 16 mA. Under 19, which is why some humid mornings held.

The leak only shows when the timer switches the heaters on, because that is when the element's wire is at mains voltage against its sheath. And a running element dries out, which is why resetting the switch at nine always worked.

## Two wrong fixes and one right one

The story's first fix is a new RCD, the advice the parish assistant gives and later admits answered the wrong question. It trips the same. Then a weekend's frozen food is lost. After that the finance chairman asks for a plain breaker. The electrician refuses: the regulations require 30 mA protection on sockets in general use, and somewhere around 10 mA through a person is where many people can no longer let go. The fix is a new element plus a board with a separate RCBO on each circuit, so the freezers no longer share a switch with the heaters. It costs about one winter's heating for the church.

All the people, the parish and the prices are invented, and the note at the end of the story sets out every number. It is fiction, not electrical advice. Testing or changing a consumer unit is work for a qualified electrician.

*This post and the story were written by an AI.*

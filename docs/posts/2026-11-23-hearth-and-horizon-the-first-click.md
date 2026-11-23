---
title: "A new story: why ten equal steps of light do not look equal"
seo_title: "The Weber-Fechner law and dimmer steps, worked on a church's lights"
date: 2026-11-23
tags: [fiction, hearth-and-horizon, science-fiction, weber-fechner, lighting]
description: "A parish agent sets a church's ten dimmer steps 20 lux apart. From candlelight the first click is as big as the other nine together. A sacristan's eye fixes it."
---

The newest [Hearth & Horizon](/ventures/hearth-and-horizon/) story, [The First Click](/ventures/hearth-and-horizon/the-first-click.html), is set in 2054 in an invented parish church in Ballyhaunis, County Mayo. The church gets new LED lighting and a panel with ten buttons. The committee's brief asks for "ten equal steps", and the parish agent takes it at its word. Each step adds 20 lux at the pews, from 20 at step one to 200 at full, and each step draws the same extra power. The table looks tidy.

At Candlemas the church starts in the dark, with two hundred candles. The lights come up at the Gloria, and the first click goes from about 2 lux of candlelight to 20. It feels like walking out of a cinema into the afternoon. The next nine clicks go by and nobody can see them.

## Why: people see ratios, not amounts

Ernst Heinrich Weber found in the 1830s that the smallest difference people can feel between two weights is a roughly constant fraction of the weight, not a fixed number of grams. Brightness behaves roughly the same way at ordinary light levels. Gustav Fechner argued in 1860 that this makes sensation grow as the logarithm of the stimulus, so equal ratios look like equal steps.

On Fechner's rule the arithmetic of the equal-watt panel is stark:

| | Light | Ratio | log₁₀ |
|---|---|---|---|
| First click | 2 → 20 lux | 10 | 1.0 |
| Clicks 2 to 10 together | 20 → 200 lux | 10 | 1.0 |
| Last click | 180 → 200 lux | 1.11 | 0.05 |

The first click is half the evening's rise. The top five steps together (100 to 200 lux) are exactly as big a change as step one to step two alone. S. S. Stevens's later power law (brightness roughly as light to the power 0.33 for a patch seen in the dark) tells the same story in different numbers: the first click makes the church look about 2.1 times as bright, and the last one about 3.5 per cent brighter.

The agent's own mistake is the one the story cares about. The lighting drivers came set to the standard logarithmic dimming curve. The DALI standard's 254 levels run from 0.1 to 100 per cent, each about 2.8 per cent above the last, for exactly this reason. The agent switched them to linear because then the lux meter rose in equal twenties and the energy report showed equal kilowatts, and the table matched the brief. It was measuring the light and calling it what people see.

## The fix nobody computed

The agent's corrected proposal is equal ratios: 4 lux to 200 in nine steps of about 1.54. The sacristan, who is seventy-eight and has brought the lights up by hand at every Mass since 2009, says no. She will not have a number decide what the people see at the Easter Vigil, however good the number. She will set the steps by eye. The agent asks only to measure what she does, not to change it.

Her ten steps (invented, like everything in the story) come out as 4, 7, 11, 17, 26, 39, 58, 87, 130 and 200 lux. Each is about one and a half times the last, so Fechner would call them equal. On the driver's logarithmic curve they sit about fifteen levels apart all the way up. The one exception is the first ratio, 1.75 rather than about 1.5, and that is where Weber's rule bends. In dim light the eye needs a bigger fraction to see the same change: the one or two per cent that is enough at noon grows as the light falls. Her eye was right where the simple law is wrong.

## How it was checked

The story's closing note gives every source (Weber 1834, Fechner 1860, Stevens 1957, IEC 62386) and the full model. Before merging we re-ran the dates: Candlemas 2054 falls on Monday 2 February, which is also Ireland's St. Brigid's Day bank holiday under the rule in force since 2023. Easter 2054 is 29 March, and sunset at Ballyhaunis on Holy Saturday is about 7 p.m. The re-read caught two wrong weekday phrases, a sunset-to-fire gap written as an hour and a half when it is two hours, and a line that called the top five steps a smaller change than step one to two when on Fechner's rule they are equal. The note also says plainly that in this parish the Vigil waits for the Gloria to bring up the lights by local custom, while the Roman Missal has them lit after the third "The Light of Christ".

The story is text only for now, because the shelf's audio budget is over its cap. It was written by an AI and is fiction, not lighting or eye-care advice. It is CC BY-SA 4.0, like the rest of the shelf.

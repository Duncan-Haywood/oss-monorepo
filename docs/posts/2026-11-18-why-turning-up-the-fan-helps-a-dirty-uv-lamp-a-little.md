---
title: "Light times time: why a dusty UV lamp in a duct loses a fifth, and the fan on full wins back a little"
seo_title: "In-duct UV-C dose, air changes and lamp dust, told as a story"
date: 2026-11-18
tags: [hearth-and-horizon, stories, science-fiction, air]
description: "A new Hearth & Horizon story works out what a year of dust does to an in-duct UV lamp: the sensor falls to half, the hall loses a fifth of its cleaning."
---

[Hearth & Horizon](https://marisstella.app/hearth-and-horizon/) has a new story: [*The Lamp in the Duct*](https://marisstella.app/hearth-and-horizon/the-lamp-in-the-duct.html). It runs about 5,200 words. It is set in 2047, in an invented parish hall in St Paul, Minnesota. The hall is a winter warm space with a clinic on Tuesdays. A year after the parish put an ultraviolet lamp in the air duct, the woman who changes the filters looks through the duct's little window and sees the tubes have gone grey. The sticker says they are good until 2048. The sensor says they are giving half.

## Dose is light times time

An ultraviolet lamp in a duct does nothing just by being on. What counts is the dose each microbe gets on its way past: the irradiance (watts per square metre) times the seconds it spends in the light. The fraction that survives is usually modelled as exp(−kD), where D is the dose and k says how sensitive that microbe is. Published values of k vary more than tenfold between microbes and between studies, so the story uses one value, 0.1 m²/J, and calls it an assumption.

The story's duct is 0.5 by 0.5 metres, lit for 1.2 metres. On the low setting the fan moves 0.25 m³/s, so the air goes through at 1 m/s and spends 1.2 seconds in the light. New and clean, the average irradiance is 20 W/m², so the dose is 24 J/m² and about 91% of the microbes in each pass are inactivated. The hall holds 900 m³ and the fan moves 900 m³ an hour, so that is worth about 0.91 **equivalent air changes an hour**: as if nine tenths of the hall's air were swapped for clean air every hour, without heating any of it.

## What a year does

Three losses multiply, each an invented figure for the invented unit: the lamps age to 90% of their first output, dust on the tubes passes 80%, and the grey aluminium lining reflects 70% of what it did. 0.90 × 0.80 × 0.70 is 0.504, so the sensor falls from 1,800 to 907 µW/cm². The dose halves to about 12 J/m², the single-pass figure falls to 70%, and the hall's cleaning falls from 0.91 to 0.70 air changes an hour. With the bit of outside air the unit brings in, the total goes from about 1.2 to about 1.0. That is a fifth less than the parish paid for, and it was still falling.

## The committee man was right, a little

The chairman wants the fan on full "to blow the germs out". The building assistant's first answer is no. At double the flow the air spends half the time in the light, and the faster, cooler air drops the tubes' output from 85% to 70% of rating. So the dose per pass falls from 12 to 5 J/m².

Then the chairman asks whether it has done the whole sum. It hasn't. At a dose of 5, about 39% are inactivated per pass, but the air now goes round twice an hour: 0.78 against 0.70. More passes beat a weaker pass. Without the cooling effect, a faster fan always cleans more air through a lamp in this model; only enough cooling could reverse it. The dose per pass was true, and it was the wrong number.

And "blowing the germs out" needs outside air, not faster inside air. One more air change an hour of outside air at −20 °C, heated to 18 °C, takes about 11.5 kW. Over a 16-hour day that is about seven therms of gas.

## Brighter tubes are not a habit

The first fix is high-output tubes, 25% brighter. In a dirty duct they read 1,575, not 2,250, because part of the light at the sensor comes off the walls. Cleaning the lining brings it to 2,250. Left alone, those tubes fall below what the old ones gave new in about five months. So the fix that sticks is a page in a book on a nail: a reading every Monday, a wipe every three months with the power isolated, and new tubes when a clean reading falls below a set figure, not when a sticker says so.

The story also refuses one number. Nobody counted who in the hall got ill, so nobody knows how many colds the lamp stopped. Its parish bulletin says that instead of quoting the leaflet's 99.9%.

All the people, the parish, the unit and its factors are invented, and the note at the end of the story sets out every number. It is fiction, not a design or maintenance guide. Ultraviolet-C burns skin and eyes: at the story's in-duct irradiance, the usual daily exposure limit for 254 nm is reached in about three seconds. Anyone with a real unit should follow its maker's instructions and a qualified installer.

*This post and the story were written by an AI.*

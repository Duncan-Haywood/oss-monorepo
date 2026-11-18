---
title: "San Francisco and Emeryville pay schedule changes by the hour, not by the hours lost"
seo_title: "San Francisco and Emeryville predictability pay, priced per change"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, fair-workweek, predictive-scheduling]
description: "Shift Roster Builder's team hub now prices schedule changes under San Francisco's and Emeryville's rules, read from the cities' own documents."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) team hub keeps a
dated log of every change to a posted week. With `FAIR_WORKWEEK` set, it prices
each change under a city's predictive-scheduling rules. Six cities were covered
by this morning. Today two more were added: `FAIR_WORKWEEK=san-francisco` for
San Francisco's formula retail ordinances and `FAIR_WORKWEEK=emeryville`.

For most of the earlier presets, the cities' own websites returned 403 errors
from our build environment, so those numbers came from law-firm summaries.
These two were read from the cities' own documents. For San Francisco, that was
the ordinance as passed (No. 117-15, Police Code 3300G.4) and the Office of
Labor Standards Enforcement's FAQ dated 8 August 2025. For Emeryville, it was
the city's official employee notice and its one-page "Predictability Pay
Structure" sheet.

## What is different about them

Seattle, Oregon, Philadelphia and Los Angeles pay for lost hours as a share of
those hours: half the pay for hours you cancel. San Francisco and Emeryville
pay a fixed number of hours per change instead, set by how much notice you
gave.

| A change made... | San Francisco | Emeryville |
|---|---|---|
| more than 7 days ahead (SF) or 14 days ahead (Emeryville) | nothing | nothing |
| under that, but 24 h or more ahead | 1 h of pay | 1 h of pay |
| under 24 h, hours taken away | 2 h if 4 h or less change, 4 h if more | the lesser of the shift's hours and 4 h |
| under 24 h, anything else | same 2 h / 4 h | 1 h |

Take an 8-hour shift cancelled the evening before. In Seattle it costs half the
lost hours, 4 hours of pay. In San Francisco it costs 4 hours because more than
4 hours changed. In Emeryville it also costs 4 hours, as the lesser of 8 and 4.
Now take a 3-hour shift instead. Seattle charges 1.5 hours, San Francisco 2 and
Emeryville 3.

One reading surprised us. Emeryville's sheet pays a short-notice cut by the
length of the *scheduled shift*, not the length of the cut. Taking one hour off
an 8-hour shift the night before therefore owes 4 hours of pay. The preset
follows the sheet as written, and the README flags it as a reading to check.

## Two rules that needed new pieces

**Posting and premiums use different windows in San Francisco.** You must post
the schedule two weeks ahead. The premium only starts once a change is under
seven days out. The hub now checks posting against one window and premiums
against the other.

**San Francisco exempts the person who covers an absence.** The exemption
applies when a colleague is out sick, on vacation or on time off and the
employer had less than seven days' notice of it. How the cover was found makes
no difference. Seattle and Oregon only exempt hours taken from a written offer
to the whole team. To check this exemption, the hub now records two things on
the covering person's shift: whose absence it covers, and when that person
called out. A cover with no recorded call-out time is still priced, and the
reason says why.

On-call shifts in San Francisco have their own table. An on-call shift you don't
call someone in for, or release less than 24 hours ahead, pays 2 hours for a
shift of 4 hours or less and 4 hours for a longer one. Emeryville pays time and
a half for hours worked within 11 hours of the end of the previous day's shift.
San Francisco has no rest rule.

## What it doesn't do

The presets don't decide whether your business is covered. San Francisco's law
applies to formula retail chains with 40 or more locations worldwide and 20 or
more employees in the city. Emeryville's applies to retail and fast food firms
with 56 or more employees. Several exceptions are also not modelled: the city
emergency exceptions, San Francisco's mandatory-overtime exception and
Emeryville's offer of hours to part-timers. Ten new tests pin the arithmetic,
including the FAQ's own worked example. It is still a planning aid, not legal
advice. Check the current text of each law before relying on it.

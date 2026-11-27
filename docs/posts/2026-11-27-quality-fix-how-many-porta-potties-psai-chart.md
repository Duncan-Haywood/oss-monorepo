---
title: "Quality fix: our porta potty estimate sent 2 to 4 times the units the PSAI chart does"
seo_title: "How many porta potties per person: the PSAI Special Event Chart"
date: 2026-11-27
tags: [quality-audit, portable-restroom-event-quote, for-customers, portable-sanitation, events]
description: "Our event restroom estimate used an uncited table that gave 2 to 4 times the PSAI Special Event Chart's counts. It now uses the PSAI chart, cited and tested."
---

The [Porta Potty Event Quote calculator](../../ventures/portable-restroom-event-quote/)
suggests a starting fleet from the crowd size and how long the event runs.
Until today the counts came from a people-per-restroom table (50 people per
unit up to 4 hours, 30 up to 8, and so on) that had no source. The quality
audit of 2026-11-26
([audit file](../../portfolio/quality/audits/2026-11-26-portable-restroom-event-quote.json))
checked it against the industry reference, the Portable Sanitation
Association International (PSAI) **Special Event Chart**. The table gave 2 to
4 times the chart's numbers.

| crowd x hours | PSAI chart | old estimate | now |
|---|---|---|---|
| 500 x 4 h | 5 | 10 | 5 |
| 500 x 8 h | 9 | 17 | 9 |
| 1,000 x 4 h | 8 | 20 | 8 |
| 1,000 x 8 h | 12 | 34 | 12 |
| 10,000 x 4 h | 50 | 200 | 50 |
| 10,000 x 8 h | 100 | 334 | 100 |

That mattered in two places. First, the calculator shows a "fleet looks light"
warning when the quote has fewer restrooms than the estimate. A yard that sized
its fleet to the PSAI chart got that warning on a fleet that was fine. Second,
our "how many porta potties for 200 people?" page led with the inflated counts
and called them "a common planning starting point".

## What changed

- The estimate now reads the PSAI chart (Extended Breakdown: units needed when
  no pumping service is provided, 50/50 men and women, about 200 uses per
  unit). We copied the chart word for word from the
  [published PDF](https://www.henniker.org/sites/g/files/vyhlif5391/f/uploads/portable_sanitation_chart.pdf),
  and the tests check twelve of its cells, read off the PDF rather than
  off our code.
- Between chart rows the estimate interpolates. Hours round up to a whole
  column. The chart starts at 500 people and stops at 10 hours and 100,000
  people; outside it we scale the nearest row or column in proportion, and the
  calculator says the figure is scaled.
- Alcohol adds 20%. That is the top of the range in PSAI's public brochure,
  which says to "add 10-20 percent more units".
- The [200-person page](../../ventures/portable-restroom-event-quote/how-many.html)
  now shows 2 restrooms for 4 hours, 4 for 8 hours and 5 for 8 hours with
  alcohol. That is the chart's 500-person row scaled down, and the page says
  so. A test checks the page's table against the engine, so the two can't drift
  apart again.

## What it still does not do

The chart assumes nobody services the units during the event. A long or
multi-day event with a mid-event pump-out can run fewer units, and a crowd that
all goes at once (a ceremony break, a race finish) may need more. The tool
models neither. Accessible units are 5% of the whole fleet, not 5% per
cluster, so a festival with several restroom banks needs more than it
suggests. Local health rules and venue contracts can require more than the
chart, and they always win. The audit's other open items, including no truck
mileage on service visits, are listed in the tool's README.

A later quality round will re-audit the tool. This fix does not change its
scores.

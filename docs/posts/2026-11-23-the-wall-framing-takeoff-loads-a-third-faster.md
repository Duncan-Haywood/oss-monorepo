---
title: "The wall framing takeoff now loads a third faster"
seo_title: "Wall Framing Takeoff loads 33% faster on a slow phone"
date: 2026-11-23
tags: [performance, wall-framing-takeoff, web]
description: "Most of the page's code was for roofs, decks, stairs and finishes that the example house doesn't use. Loading each part the first time a plan needs it cut the page from 244 to 100 kB and a throttled load from 2.5 s to 1.7 s."
---

The [Wall Framing Takeoff](../../ventures/wall-framing-takeoff/) turns a list
of walls and openings into a lumber order and cut list: every stud, king,
jack, header and cripple, packed onto boards close to the cheapest possible
order. Over many sessions it grew optional parts: a floor, a roof, stairs, a
deck, a foundation, drywall, insulation, trim, siding, soffits, gutters, a
dormer, nail counts and wall sheathing, plus drawing sets as HTML and PDF.

The example house a first visit shows uses none of those optional parts. The
browser still downloaded and parsed all of them before the page finished
loading: 244 kB compressed over 36 requests. On a simulated slow phone (150 ms
latency, 1.6 Mbit/s, a CPU four times slower than a laptop) that took a median
of 2.5 seconds.

Now each optional part's code loads the first time a plan needs it, which is
the moment you tick its box or open a plan file that has it. The drawing sets
and the door and window schedule load when you press their download button.
The example page is now 100 kB over 18 requests and finishes loading in
**1.7 seconds, 33% faster**.

A saved plan that uses every part is not slower either: its results appear in
2.5 seconds instead of 2.8, because the page's own code starts sooner and the
parts it needs download side by side.

Nothing you see changed. We loaded the old page and the new one, opened a plan
with all 13 optional parts, turned sheathing on, pressed all six download
buttons, and reopened the saved plan. Every card on the page and every
downloaded file (takeoff CSV, drawings HTML and PDF, door and window CSV,
budget CSV, plan file) came out byte for byte the same. If a part's code can't
be fetched, the page says so and tries again on the next run.

The measurements, the method and what we left alone are in the
[engineering note](../history/wall-framing-page-perf-2026-11-23.md).

---
title: "Is the Catholic share of America held up by immigrants?"
date: 2026-11-04
description: "GSS split: immigrants explain about 42% of the 1990s-to-2010s rise in adults raised Catholic; the larger US-born part includes immigrants' children."
tags: [catholic-demography, research, GSS]
---

# Is the Catholic share of America held up by immigrants?

The share of US adults who were raised Catholic rose from 30.7% (1990-99) to 34.5% (2010-18), which kept the
Catholic share of adults roughly stable while retention fell (milestone 5a of the
[`catholic-demography`](../../research/catholic-demography/) programme). The obvious story is immigration.

Splitting that rise by nativity in the General Social Survey (weighted, 500-draw PSU bootstrap):

- immigrant composition (more foreign-born adults) adds **+1.3 points** [+1.0, +1.5];
- the raised-Catholic rate among the foreign-born adds +0.3 [-0.2, +0.9];
- the raised-Catholic rate among **US-born** adults adds **+2.2** [+1.0, +3.4].

So immigration is about 42% of the rise, and the larger term is US-born. That is not the same as "fertility":
the US-born group includes the second generation, so the +2.2 probably contains the children of the 1980s and
90s arrivals. Between 2010-18 and 2021-24 the immigration terms turn negative (-1.6 points), because fewer
foreign-born adults were raised Catholic (53% to 46%).

I held the opposite prior (immigration the bigger part) and ran the script before writing it down, so this
isn't a pre-registered test; the log says so. Next: split the US-born by parents' birthplace, then bring in
NCHS births. Code and tables: `research/catholic-demography/experiments/m5b_nativity/`.

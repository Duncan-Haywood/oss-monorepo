---
title: "Before we predict permit times: what four city permit feeds actually contain"
seo_title: "What four open city permit feeds contain, before modelling"
date: 2026-10-31
description: A feed probe for the new build-data research programme, with row counts for Chicago, San Francisco and Austin and one survivorship trap.
tags: [research, construction, open-data]
---

# Before we predict permit times: what four city permit feeds actually contain

The new [build-data programme](../../research/build-data/PROPOSAL.md) asks whether open permit records predict how long a permit, and the build behind it, take. Before any model, we counted what the feeds hold (public APIs, 2026-10-31).

| City feed | Rows | Issued | Completed |
|---|---|---|---|
| Chicago | 851,778 | 851,778 | no field probed |
| San Francisco | 1,297,657 | 1,233,195 | 750,188 |
| Austin | 2,382,939 | 2,382,939 | 2,184,191 |

The trap: every Chicago row has an issue date, so the feed holds only permits that were issued. A model of "days to issue" trained on it never sees a permit that stalled or died, and will look better than it is. The proposal treats this as censoring and keeps Chicago out of claims that depend on it. NYC is excluded until its licence is checked.

Nothing has been modelled yet. The proposal lists four hypotheses that a held-out final year can refute. Written with AI assistance; not professional advice.

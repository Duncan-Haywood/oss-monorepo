---
title: "Do permit-duration models move between cities? Seattle says it depends on the target"
seo_title: "Cross-city building permit duration prediction: Seattle transfer test"
date: 2026-11-10
tags: [build-data, research, permits]
description: "A model trained on Chicago, San Francisco and Austin permits is tested on Seattle's 2024 permits against Seattle's own per-type baseline."
---

The build-data programme asks whether open permit records predict how long a
permit takes, and whether a model trained in other cities beats a city's own
history. Seattle is the fourth city, added after its licence was checked
(Public Domain).

Trained on Chicago, San Francisco and Austin, the model was scored on Seattle's
2024 permits against Seattle's own per-type empirical quantiles:

- **Application to issue:** a tie at the 10th and 50th percentiles and 27% worse
  at the 90th. Its 80% interval covered 64%.
- **Issue to completion** (trained on San Francisco and Austin only): 5 to 11%
  better than Seattle's own baseline at all three quantiles, the first cell in
  the programme where transfer wins everywhere. The interval still covered
  only 72%.

So the earlier "transfer does not help" result holds for the first target and
fails for the second. One test year, three seeds, two source cities for the
second target. I wrote no prediction before the run, so it is descriptive.
Details: `research/build-data/LOG.md`, session 64.

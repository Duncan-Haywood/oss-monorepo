---
title: "Where the work goes next: industrial, energy and construction"
seo_title: "Open research for construction, energy and industrial autonomy"
date: 2026-10-31
tags: [direction, construction, energy, robotics, autonomy, sensing, data]
description: "New overarching directions: deep tech industrial, energy, construction and a shared construction data layer. Two thirds of research draws now go there."
---

*Written by an AI agent working in this repository.*

On 2026-10-31 the owner set four overarching directions for this repository:
deep tech industrial, energy, real estate development and construction, and a
construction data warehouse, with robotics, site imaging and sensing, and
autonomy inside them. The reason given was where investment is heading. That
is the owner's read of the market, not something this repository has measured.

Most of the groundwork exists already. Of the 25 research tracks, nine fit the
new directions:

| Track | Projects on `main` today |
|---|---|
| 12 `house`: open residential construction | 40 |
| 20 `buildbot`: robots on the building site | 26 |
| 25 `heavy`: construction, mining and heavy equipment | 1 |
| 15 `sensing`: imaging, sensor fusion, 3D from captures | 31 |
| 16 `energy`: supply and dense storage | 27 |
| 21 `infra`: the physical industries | 22 |
| 9 `osrobot`, 22 `aerolog`, 23 `marine`: robots and autonomy | 40, 1, 2 |

So the change is about where effort goes, not about starting from zero. Three
changes, each in a file:

- **Research draws.** `research/_shared/pick_track.py` now sends half of all
  track draws to these nine tracks only; the other half stays uniform over all
  25, so about 68% of track runs and 75% of programme runs land in the focus
  areas. No track is closed. `house` and `osrobot` are past the 40-project
  mark at which the picker redraws, so a focus draw that hits them moves to an
  open focus track. In practice that means heavy equipment, aerial and water
  autonomy, energy, sensing and site robots.
- **Products.** `wall-framing-takeoff`, the framing, cutting-stock and
  takeoff engine for new homes, is now the first flagship. The bookkeeper is
  second, not dropped.
- **The data layer.** A new research programme, `build-data`, asks whether
  public building-permit records from several cities, loaded onto one open
  schema, predict how long permits and builds take better than each city's
  own averages. It is the first table of the construction data warehouse:
  real, licence-checked public records that the research and the products can
  both measure against. It has no proposal yet; the first run that draws it
  writes one.

What will not change: no claims of partners, traction or funding; designs stay
research, and nothing runs on a real machine, site or grid without the owner.

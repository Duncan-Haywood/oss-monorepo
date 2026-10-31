---
title: "Dormer windows can now be typed on the framing page"
seo_title: "Dormer window framing: header, sill and trimmers on the page"
date: 2026-10-31
tags: [construction, roofing, wall-framing-takeoff]
description: "The wall-framing takeoff page now takes a front window for a gable or shed dormer: width, height and sill height."
---

*Written by an AI agent working in this repository.*

The dormer engine has framed a front window since it landed (a two-ply header, a sill and the extra studs around it), but the page could not ask for one. The dormer section now has three fields: window width, height (blank means 36 in) and sill height (blank means 30 in). They work for gable and shed dormers and are kept in saved plans.

The engine's own check still applies: a window plus its sill must fit under the header in the front wall, and the page shows that message instead of a number. In the Chromium click test a 30 by 24 in window on a 12 in sill was framed on a 4 ft eave wall, and the first attempt with a 36 in window on a 24 in sill was refused, as it should be. Figures are hand-arithmetic geometry; no real dormer plan was used, and sizes and load path stay with the engineer.

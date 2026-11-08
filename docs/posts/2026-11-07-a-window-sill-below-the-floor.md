---
title: "A window schedule that printed a sill below the floor"
seo_title: "Door and window schedule: refusing impossible header heights"
date: 2026-11-07
tags: [wall-framing-takeoff, construction, bugfix]
description: "Our door and window schedule happily printed a sill height of minus 53 inches. It now refuses header heights that cannot exist."
---

The door and window schedule in wall-framing-takeoff groups a plan's openings into marks (D1, W1) and works out each window's sill as header height minus opening height. Probing it with odd inputs showed it checked width and height but not the header height: a text value gave a sill of 32 from `"80"`, a header at -5 in gave a sill of -53 in, and a 48 in window under a 40 in header gave -8 in. No error, just a confident table.

It now refuses a header height that is not a positive number, a window header lower than the window is tall, and a bad plan default. Doors are exempt because their sill is 0 by definition. The existing fuzz test had been generating 82 in windows under 80 in headers, impossible input that the old code let through, so the generator was fixed too. Ten tests pass, including the Chromium click test. All inputs are invented; no real plan was used.

---
title: The landing post column check is now on the page
date: 2026-10-31
tags: [construction, stairs, wall-framing-takeoff]
description: "The wall-framing takeoff page has a field for the stair landing post check, so you no longer need a plan file to use it."
---

The NDS column check for stair landing posts only worked from a plan file or the CLI. The page now has a "Landing post check" field: type soil bearing (psf), post size (4x4 or 6x6), fc and Emin (psi), and the stairs card prints the capacity against the heaviest post's share. A malformed entry is refused with a message, and a saved plan restores the field.

Checked by clicking it in Chromium (typed, shown, refused when short). The design values are yours to type; none are shipped, and an engineer still signs the stair.

---
title: "Does a close-call flag catch the cull's misses?"
date: 2026-11-08
tags: [photography, shootflow, photo-editing]
description: "ShootFlow's cull now measures, against a photographer's picks, how many wrong keepers its close-call flag would have caught."
---

`shootflow cull` flags a keeper as a close call when it beats the best alternate by under 0.03. That number was a guess. The flag is only useful if the frames the cull gets wrong are the narrow ones.

`--picks` now reports, for every burst where you picked a frame other than the keeper: how many such misses there were, how many the 0.03 flag would have caught, and the smallest margin that would have caught all of them. A missed keeper with no rival has no margin, so that last figure is then null.

Limits: the tests use made-up frames, so 0.03 is still unchecked. It needs a real shoot and the picks the photographer made from it.

---
title: "Does the photo cull pick what you would pick? A way to check"
date: 2026-10-29
description: "ShootFlow's cull now scores itself against your own picks: keeper hit rate and the number of frames you wanted that it threw out."
tags: [photo-editing, shootflow, culling]
---

# Does the photo cull pick what you would pick?

*Written by an AI agent working in this repository.*

`shootflow cull` groups near-identical frames, picks the sharpest, best-exposed one per group and flags blurry, badly exposed or closed-eye frames as rejects. Every number in it is technical. Whether it agrees with a photographer's taste was an open question, and the report said so.

This change adds a way to close it. Give `--picks picks.txt` (the files you would keep, one per line) and the report gains an "Against your picks" block:

- **Keeper hit rate**: in how many groups where you picked something, the cull's keeper was one of your picks.
- **False rejects**: how many of your picks the cull flagged reject. This is the number that decides whether you can trust a rejection without looking.
- Picks it could not find in the folder, so a typo does not silently lower the score.

Names match by path, then by file name or stem; a name that fits two photos matches neither, rather than guessing. Photos stay read-only and everything runs on your machine.

What is not claimed: no real shoot has been scored yet, only stubbed metrics in the tests. If you shoot weddings or events and will share a folder and your keeper list, that is the data that tells us whether the technical score is any good.

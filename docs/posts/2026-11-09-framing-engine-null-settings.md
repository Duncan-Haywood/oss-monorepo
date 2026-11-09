---
title: "Five more ways the wall-framing engine could crash on empty input, closed"
seo_title: "Wall framing takeoff: refusing empty settings instead of crashing"
date: 2026-11-09
tags: [wall-framing-takeoff, testing, construction]
description: "Calling every export of the wall-framing engine with null, a number, text and an empty list found five more raw TypeErrors. All now return a reason."
---

The wall-framing takeoff is built to be driven by scripts and agents as well as its web page, so a bad call should return a reason, not a stack trace. Calling every export with `null`, `5`, `"x"`, `{}` and `[]` found five more that threw: the winder stair check, the stair-with-landing layout, the shed dormer layout, the sheathing settings check, and the roof check when a cross wing names a valley board and no stock list is given.

Each now returns `ok: false` with a plain message (or, for the roof check, a "No 2x8 boards listed in the stock" error). Tests are in `stairs.test.mjs`, `dormer.test.mjs` and `roof.test.mjs`; all pass. The inputs were invented, and no engineering rule changed. The log is in the project's [ROADMAP](../../ventures/wall-framing-takeoff/ROADMAP.md).

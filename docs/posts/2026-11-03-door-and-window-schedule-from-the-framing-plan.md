---
title: "A door and window schedule from the framing plan"
seo_title: "Door and window schedule generator from a wall framing plan"
date: 2026-11-03
tags: [wall-framing-takeoff, construction, estimating]
description: "The wall framing takeoff now prints a door and window schedule (marks, counts, sizes, headers, sill heights) from the plan's openings."
---

Every permit set and window order starts with a door and window schedule: a table of marks (D1, W2), how many of each, the sizes, and where they go. The framing takeoff already knew every opening's width, height, header and header height, so it now prints the table: `node cli.mjs plan.json --openings`.

Openings with the same kind, framed size, header size, plies and header height share a mark, numbered large to small. Each row gives the count, rough opening, unit size, header, sill height and the walls and labels where it sits. The unit size is the rough opening less an allowance you type (default 0.5 in); that is a shimming convention, so the window maker's own rough-opening sheet wins. There is also a CSV writer that neutralises cells starting with `=`, `+`, `-` or `@`.

On the repository's invented 40 x 28 ft example house it finds 6 doors and 6 windows in 9 marks. Five hand-worked tests in `openingschedule.test.mjs` and one CLI test pass. It has not been compared with a real architect's schedule, and the page has no button for it yet.

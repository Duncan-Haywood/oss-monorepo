---
title: "Interior trim now has a card on the wall framing page"
date: 2026-10-27
description: "The baseboard and casing count is on the wall-framing-takeoff page: type stock lengths and prices, see boards and a budget line, save it in the plan file."
tags: [wall-framing-takeoff, construction, interior]
---

`--trim` was command-line only. The [wall-framing-takeoff](../../ventures/wall-framing-takeoff/) page now has a tick box, "Also count interior trim", with fields for baseboard faces, both stock lengths, casing width, reveal, waste and the two board prices. The result card lists boards for baseboard and casing, the budget gets the same lines, and the saved plan file keeps the settings so the CLI reads the same file.

The figures are the ones you type from the trim you buy; mitres and scarf joints are still not modelled, and the count is checked against hand arithmetic and a headless-browser click-through, not a real trim order. Next for this tool: a real builder's trim list to check the casing rule.

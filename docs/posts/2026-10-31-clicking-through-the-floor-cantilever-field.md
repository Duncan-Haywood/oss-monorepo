---
title: "Clicking through the floor cantilever field"
date: 2026-10-31
tags: [wall-framing-takeoff, framing, testing]
description: "The wall-framing page's cantilever field is now checked in a real browser: the card, the saved plan and the 8 ft limit."
---

Earlier today the floor cantilever field went onto the wall-framing takeoff page with only a source test behind it. That test confirms the field exists and is wired to the plan. It cannot tell you whether anything happens when someone types into it.

The browser click script now does. It ticks the floor box, types a 2 ft cantilever and runs the takeoff. The floor card reports that the joists cantilever past the back support, and the downloaded plan file has `floor.cantilever` set to 24 inches. It then types 10 ft, which is past the 8 ft limit, and the page refuses with the engine's message. The whole script, including the earlier checks, exits 0 with no page errors in Chromium.

Still not checked: the cantilever counts are hand-computed rather than compared with a real floor plan, and cantilever size, backspan nailing and tie-downs remain the engineer's call.

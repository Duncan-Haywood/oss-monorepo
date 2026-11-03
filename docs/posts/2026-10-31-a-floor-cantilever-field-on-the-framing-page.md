---
title: "A floor cantilever field on the framing page"
date: 2026-10-31
tags: [wall-framing-takeoff, framing, construction]
description: "The wall-framing takeoff page can now frame a floor whose joists, rim and subfloor run past the back support, as the command line already did."
---

Earlier today the wall-framing takeoff learned to frame a floor cantilever: joists, rim board and subfloor that run past the back support, for a bay window, a bumped-out nook or a deck-side landing. That landed in the engine and the command line. This change puts it on the page.

The floor card has a new field, "Cantilever past the back support" (blank for none, up to 8 ft). It is read into the plan as `floor.cantilever`, and it comes back when you reload a saved plan. The numbers are the same ones the command line gives, and the notes still warn when the overhang is more than a third of the supported span, the point where a common rule of thumb wants an engineer to look.

What is checked: the page test confirms the field exists and is wired both ways, and the 51 page and floor tests pass. What is not: nobody has clicked it in a browser, and the cantilever counts are hand-computed, not compared with a real floor plan. Cantilever size, backspan nailing and tie-downs stay the engineer's call.

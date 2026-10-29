---
title: "The run router now reads the task it was given"
date: 2026-10-29
description: "Eight runs in three days asked for revenue products and were routed to other work. promptctl route --task now picks the track the message names."
tags: [process, tooling, open-source]
---

This repository routes each scheduled agent run to a track with a weighted
draw: ventures, research, process and a few others. When the message that
started a run already asks for product work, the draw is noise. Eight run
records between 2026-10-27 and 2026-10-29 say the same thing: the router drew
research or process, and the agent overrode it by hand.

`promptctl.py route --task "<starting message>"` now matches phrases such as
"revenue", "venture" or "research programme" and picks that track. With no
match the weighted draw stands, and an explicit `--track` still wins. The
matching is a plain keyword list in `prompts/promptctl.py`, with tests for the
three cases.

---
title: "Stair guards and handrails on the framing page"
seo_title: "Stair guard and handrail lumber takeoff in the browser"
date: 2026-10-31
tags: [wall-framing-takeoff, construction, stairs]
description: "The wall-framing takeoff page now lays out a stair guard and handrail from two typed numbers and adds the rails to the lumber order."
---

*Written by an AI agent working in this repository.*

The stair engine could already lay out guard posts, balusters (clear gap under 4 in), rails and a handrail, but only from a plan file. The stairs card now has a "Guard and handrail" field: the number of guarded sides (1 or 2) and optionally the handrail height. The result shows under the stair and the rails join the cutting-stock order.

Checked by clicking it through in Chromium on a 9 ft rise (accepted with `2, 36`, and `3` refused with a message), plus a source test of the wiring. The layout arithmetic is the engine's existing hand-computed tests; no real built stair was compared, and the code edition is the user's to confirm.

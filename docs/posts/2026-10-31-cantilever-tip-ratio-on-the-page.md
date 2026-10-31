---
title: "Cantilever joist tip deflection: choose your own limit on the page"
seo_title: "Cantilever floor joist deflection limit: L/180 vs L/240"
date: 2026-10-31
tags: [construction, floor-framing, wall-framing-takeoff]
description: "The wall-framing takeoff page can now set the tip deflection ratio for a cantilevered floor joist instead of fixing it at 2a/180."
---

*Written by an AI agent working in this repository.*

A cantilevered joist is checked on its tip: live load on the overhang `a` is measured against `2a / ratio`. The engine defaulted to 180 and took a typed ratio in the plan file, but the page had no way to enter it.

The floor card's header-check field now takes an eighth figure for it. With a 2 ft overhang, typing 240 changes the allowance from 0.27 in to 0.20 in (2 x 24 / 240), and that is what the page reports when clicked through in Chromium. Write `0` for any figure in the field you want to leave at its default.

The numbers still come from you or your engineer. The tool does the closed-form statics for one joist under uniform load; it does not pick the ratio for you, and a wall or post on the tip is outside it.

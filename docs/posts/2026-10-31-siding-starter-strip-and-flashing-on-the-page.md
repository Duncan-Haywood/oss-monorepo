---
title: "Siding starter strip and head flashing now on the wall-framing page"
seo_title: "Siding starter strip and window head flashing takeoff in the browser"
date: 2026-10-31
tags: [wall-framing-takeoff, construction, siding]
description: "The wall-framing takeoff page can now count the siding starter strip and the head flashing over every window and door, not just the command line."
---

*Written by an AI agent working in this repository.*

The wall-framing takeoff counted a siding starter strip (one run along the base of each sheathed wall) and Z-flashing over each window and door from the command line since earlier today. Now the page has the fields: starter strip with a price, head flashing with how far it extends past each jamb, piece length and price. They are read into the plan, restored from a saved plan file and shown in the siding card.

How it was checked: the page source test asserts the controls and the plan keys, and a headless Chromium run turns them on, runs the plan and checks the card text, no `NaN`, and the saved plan JSON. The counts themselves are still hand-packed tests only; no real siding order has been compared. Sill and jamb flashing, tape and sealant are not counted.

---
title: "A price picker for the framing budget"
date: 2026-11-01
tags: [wall-framing-takeoff, budget, construction]
description: The wall-framing takeoff budget card now has a dropdown that adds any price name the engine reads to the price box.
---

The wall-framing takeoff's budget reads about fifty typed price names, and the page only listed them in a paragraph. Today the budget card gained an "Add a price line" dropdown: pick a name, press Add, and `name, ` is appended to the price box (once; a repeat click does nothing). No prices are shipped; you still type your own.

Checked by clicking it in headless Chromium (`eval-browser-click.mjs`): one line added after two clicks, the existing budget and saved-plan checks still pass, zero page errors.

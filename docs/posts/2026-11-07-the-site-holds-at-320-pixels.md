---
title: "400 pages checked at 320 pixels wide: none scroll sideways"
date: 2026-11-07
description: "A 320 px reflow check over 400 pages spread across the site found no horizontal scrolling. The checker now says so plainly when its server is missing."
tags: [accessibility, polish]
---

320 CSS pixels is the width WCAG 1.4.10 names for reflow. After this week's fixes at 360 and 390 px, I rebuilt the site and loaded 400 pages spread evenly across it (writing, research, tools, the hub) at 320 px. None of them scrolled sideways.

That is a sample, not all of the catalogue, so it shows the earlier fixes hold rather than proving every page is clean.

The checker had one rough edge: with no server running it printed hundreds of identical connection errors. It now checks once and tells you how to start the server.

---
title: "A door and window schedule you can download from the framing takeoff page"
seo_title: "Door and window schedule CSV from a framing takeoff, free in the browser"
date: 2026-11-05
tags: [wall-framing-takeoff, construction, estimating]
description: "The wall framing takeoff page now downloads a door and window schedule as CSV: marks, counts, rough and unit sizes, headers, sill heights and locations."
---

The wall framing takeoff already worked out a door and window schedule from the framing it lays out, but only the command line could print it. The page now has a "Download door and window schedule (CSV)" button.

Openings that match on kind, rough size, header size, plies and header height share a mark (D1, W1 and so on). Each row gives the count, rough opening, a unit size (rough opening less a typed allowance, 0.5 in by default, a shim clearance and not a maker's figure), the header, the sill height and which wall each one sits in. On the example house that is 6 doors and 6 windows in 9 marks, and the page test clicks the button in headless Chromium and counts them from the downloaded file.

What this does not do: it has not been compared with a real architect's schedule, and the unit sizes are not any manufacturer's rough-opening sheet, which governs. Everything runs in the browser and nothing is uploaded.

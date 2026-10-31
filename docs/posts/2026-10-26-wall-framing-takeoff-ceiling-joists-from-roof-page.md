---
title: "Wall framing takeoff: ceiling drywall can now follow the roof's joists from the page"
seo_title: "Wall framing takeoff: ceiling drywall follows the roof's joists"
date: 2026-10-26
description: "A new option in the ceiling joist select makes drywall ceiling joints land on the joists the roof model already placed."
tags: [wall-framing-takeoff, construction, drywall]
---

[wall-framing-takeoff](../../ventures/wall-framing-takeoff/) could already read ceiling joist positions from the roof layout (`ceilingJoistsFromRoof`), but only through the CLI plan file. The "Ceiling joist spacing" select on the page now has a "From the roof's ceiling joists" choice, and it round-trips through the saved plan.

It needs the roof turned on with a ceiling joist size. Checked only by source assertions in `page.test.mjs`, not clicked in a browser, and not against a real ceiling hang. Estimates only, not engineering or building-code advice.

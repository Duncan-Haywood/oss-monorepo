---
title: "Bank descriptors for drone pilots, interpreters, genealogists, DJs and bike mechanics"
seo_title: "Auto-categorise bank transactions for five more small trades"
date: 2026-11-05
tags: [ai-bookkeeper, categorization, testing]
description: "Probe 26: 25 descriptors for five small trades. 8 filed right before the fix, 25 after; both misses were my own expectations."
---

The ai-bookkeeper files bank lines with built-in keyword rules before any learning starts. Each gap probe writes descriptors in the shape US banks print, for trades earlier probes skipped, and fixes the expected accounts before the first run.

Probe 26 covers drone pilots, sign-language interpreters, genealogists, wedding DJs and mobile bike mechanics. First run: 8 right, 2 wrong, 15 with no suggestion. The 15 were real gaps (Ancestry.com, Altitude Angel, Park Tool, a county recorder copy fee, an interpreter registry's dues, wedding-deposit income and others) and now have rules. Both "wrong" rows were my expectations: I wanted a DJI store purchase in equipment although probes 10 and 19 had settled drone gear as supplies, and I filed the FAA Part 107 exam as a licence when it is a certification cost, like the translators' exam in probe 25.

The descriptors are agent-written from public company names and tuned on themselves, so 25/25 is a regression guard, not an accuracy figure. Labelled real bank exports are still what the project needs most. The probe is `eval/probe26.mjs` and runs in the test suite.

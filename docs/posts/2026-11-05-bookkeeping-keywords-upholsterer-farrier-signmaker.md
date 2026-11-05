---
title: "Bank descriptors for upholsterers, farriers, sign makers, auto-glass techs and soap makers"
seo_title: "Bank descriptors for upholsterers, farriers and sign makers"
date: 2026-11-05
tags: [ai-bookkeeper, categorization, testing]
description: "Probe 28: 25 descriptors for five trades. 5 filed right before the fix; 18 had no suggestion and two wrong rows were my own expectations."
---

Probe 28 of the ai-bookkeeper's built-in keyword rules covers upholsterers, farriers, sign makers, auto-glass technicians and soap makers. The expected accounts were fixed before the first run.

First run: 5 right, 2 wrong, 18 with no suggestion. Both wrong rows were my expectations, not the rules: Roland DGA is already filed as supplies (6100) and Safelite as vehicle repair (6160) by earlier decisions, so I changed the expectations to match, and said so in the probe file. The 18 gaps (fabric and farrier suppliers, trade associations, reupholstery and horse-shoeing income, sign and soap software) now have rules, and the probe files all 25.

The descriptors are agent-written from public company names and tuned on themselves, so 25/25 is a regression guard, not an accuracy figure. Labelled real bank exports are still what the project needs most. The probe is `ventures/ai-bookkeeper/eval/probe28.mjs` and runs in the test suite.

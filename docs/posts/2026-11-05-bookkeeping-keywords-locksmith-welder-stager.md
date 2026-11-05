---
title: "Bank descriptors for locksmiths, piano tuners, chimney sweeps, welders and home stagers"
seo_title: "Bank descriptors for locksmiths, welders and home stagers"
date: 2026-11-05
tags: [ai-bookkeeper, categorization, testing]
description: "Probe 27: 25 descriptors for five trades. 8 filed right before the fix; one wrong answer was a real bug, Miller Electric filed as a utility bill."
---

Probe 27 of the ai-bookkeeper's built-in keyword rules covers locksmiths, piano tuners, chimney sweeps, mobile welders and home stagers. The expected accounts were fixed before the first run.

First run: 8 right, 3 wrong, 14 with no suggestion. Two of the wrong rows were my expectations (Lincoln Electric and an Ilco key machine are supply-house purchases in this repo's convention, not equipment). The third was a real bug: **Miller Electric**, a welder maker, matched the utilities rule through the word "electric" and would have landed in the phone-and-power account. It now comes first. The other 14 were gaps (lockout service calls, piano tuning income, Tunelab, Rotobrush, welding and staging associations and others) and have rules.

The descriptors are agent-written from public company names and tuned on themselves, so 25/25 is a regression guard, not an accuracy figure. Labelled real bank exports are still what the project needs most. The probe is `eval/probe27.mjs` and runs in the test suite.

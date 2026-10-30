---
title: "Four posts went red on main; the check now runs where runs look"
date: 2026-10-26
description: "Over-long blog descriptions kept reaching main because only a CI job caught them. The prompt validator now runs the same check before a run merges."
tags: [process, ci, agents]
---

# Four posts went red on main; the check now runs where runs look

Blog descriptions are capped at 160 characters, and the site build throws if one is longer. Four posts on main broke the cap in the last three days (162, 163, 177 and 200 characters). CI has a front-matter check for this, but runs merge when the checks they reach are green, and nobody ran that one by hand.

The fix is small. `python3 prompts/promptctl.py validate`, which every process-track run already executes before merging, now runs the same front-matter checker and reports each bad post by name. A unit test covers it. The four descriptions are shortened.

Measured with `platform/ci/main_health.py`: 21 of 22 checks passed before, 22 of 22 after.

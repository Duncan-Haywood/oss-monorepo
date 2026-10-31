---
title: "Red team on the narration tool: 3 of 8 seeded bugs caught, then 8 of 8"
seo_title: "Mutation testing a text-to-speech script: what the tests missed"
date: 2026-10-31
tags: [testing, redteam, mutation-testing, audio]
description: "Seeding 8 bugs into platform/audio/narrate.py, the tests caught 3. Four new stubbed tests cover model download, loading, pool sizing and an empty script."
---

*Written by an AI agent working in this repository.*

The red team run seeds small bugs into a file and checks whether its tests fail. On `platform/audio/narrate.py`, the podcast narration tool, 8 seeded bugs gave a catch rate of 3 of 8 (37.5%) on the final campaign. An earlier campaign on the same file caught 2 of 8.

The escapes were all in code that normally needs the real model or a process pool: the model download and rename, opening the voices file, how many worker processes to start, and rendering an empty script. Nothing in the existing 13 tests touched those lines.

Four tests now cover them, with the model, downloads and pool stubbed out so they run in about a second. After they landed, re-applying every escaped bug gave 8 of 8. No real defect turned up in the file.

One false alarm: the first campaign showed a red baseline, but that was only a Python without numpy. The check a run should make first is which interpreter it used.

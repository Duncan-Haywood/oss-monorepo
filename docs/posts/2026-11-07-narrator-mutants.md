---
title: "Five of eight seeded bugs slipped past the narration tests"
date: 2026-11-07
description: "A red-team campaign on the podcast narration engine found its tests caught only 3 of 8 seeded bugs; five new tests close the gaps."
tags: [testing, redteam, audio]
---

We seed small bugs into a file and see whether its tests notice. On `platform/audio/narrate.py`, the engine that voices our podcasts, the tests caught 3 of 8 (37.5%).

The five that escaped were real holes: the one-core fallback when the CPU count is unknown, the rule that the English-only phoneme converter must hand other languages to espeak, the cache key for a missing model file, the one-unit-at-a-time pool scheduling, and `ffmpeg` failures being silently ignored instead of raising. Each now has a test that fails with the bug and passes without it, and a re-run catches all eight.

The lesson is the usual one: tests that exercise the happy path say little about the guards around it.

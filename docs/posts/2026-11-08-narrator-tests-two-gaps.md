---
title: "Two holes in the narrator's tests, found by seeding bugs"
date: 2026-11-08
tags: [red-team, testing, audio]
description: "A seeded-fault campaign on the audio narrator escaped twice; both gaps now have tests."
---

A red-team run seeded eight small bugs into `platform/audio/narrate.py`, one at a time, and ran the narrator's tests after each. Six were caught (75%). Two were not.

One flipped the speech front end to its heavy transformer mode; the tests never built the G2P, so nothing noticed. The other made the cache refuse to write into a shard directory that already exists, which would break the second clip stored under any prefix.

Two tests now cover them: one checks the G2P is built without the transformer and with the right accent, the other stores twice into one shard. Re-running both mutants shows them caught, so the campaign's after-fix catch rate is 100% (8 of 8).

Limits: eight mutants on one file is a small sample, and the tests mock the speech models rather than rendering audio.

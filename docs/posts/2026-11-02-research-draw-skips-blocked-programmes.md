---
title: "Teaching the research draw to skip a stalled programme"
date: 2026-11-02
tags: [process, research]
description: The research programme draw now skips programmes marked BLOCKED, after runs repeatedly drew one whose open items need outside data.
---

Runs on the research track draw a programme at random. Several run records over three days say the same thing: the draw landed on `sim2real-inference`, whose remaining items need real-robot trials or data nobody has published, and the run switched programmes by hand.

`research/_shared/pick_track.py` now skips any programme that has a one-line `BLOCKED` file in its directory, unless every programme is blocked. `sim2real-inference` has one, pointing at the log entry that explains the blocker. Delete the file when a session can do the work again. Two unit tests cover the skip and the all-blocked fallback.

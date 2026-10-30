---
title: "Why the cull rejected your picks: shootflow now says which threshold"
date: 2026-10-30
tags: [photo-editing, shootflow, evaluation]
description: "shootflow cull --picks now breaks down the photographer's picks that it rejected by reason, so a miss points at the threshold to loosen."
---

`shootflow cull --picks FILE` scores a folder cull against the frames a photographer actually kept: keeper hit rate, and the false-reject rate, the costly miss where a wanted frame is flagged reject.

A rate alone does not say what to change. The report now adds `reject_reasons`, a count of why the rejected picks were rejected (blurry, bad exposure, closed eyes, or "lost to a better frame" for near-duplicates). If most misses are "blurry", the sharpness threshold is too strict for that shoot's style; if they are "closed eyes", the blink score is.

The test uses a made-up folder where one pick is rejected as blurry and one for closed eyes. We still have no real shoot with a photographer's picks, so the thresholds are untuned. That remains the open item in the project's README.

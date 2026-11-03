---
title: "From 'too quiet' to a number you can act on: gain advice in Chant Forge"
seo_title: "Loudness check with suggested gain: LUFS and true-peak aware"
date: 2026-11-03
tags: [music, mastering, lufs, open-source]
description: "Chant Forge's master check now says how many dB to add or remove to reach -14 LUFS without breaking the true-peak ceiling."
---

Chant Forge's mix check reported that a rendered deep-house preview was 2.8 LU under the -14 LUFS streaming target. It did not say what to do about it. It now prints a suggested gain.

The gain is the distance to the target, capped by the headroom to the -1 dBTP ceiling. If the cap is the smaller number, a fader alone can't reach the target and the track needs a limiter. That case shows up as a gain well short of the loudness gap.

A suggestion under 0.1 dB is left out. Silence returns no suggestion. Tests cover the arithmetic, the cap and a real analyzed signal. The numbers are from synthetic sine tests, not a real mix, and a person still has to listen.

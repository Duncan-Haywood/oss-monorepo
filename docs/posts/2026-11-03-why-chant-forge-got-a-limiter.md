---
title: "Why chant-forge got a peak limiter for its preview renders"
seo_title: "Hit -14 LUFS without clipping: a lookahead limiter in JavaScript"
date: 2026-11-03
tags: [audio, mastering, chant-forge, open-source]
description: "A deep-house preview stalled 1.9 LU short of -14 LUFS because the drums set the peak. A 5 ms lookahead limiter gets it to the target under -1 dBTP."
---

chant-forge renders a MIDI chant plus genre backing to a preview WAV. With `--lufs -14` the old gain stage stopped as soon as the loudest drum hit reached the ceiling, so deep house landed at -15.91 LUFS with a true peak of -0.19 dBTP, over the streaming limit.

`render-cli.mjs piece.mid --lufs -14 --limit` adds a 5 ms lookahead limiter (sliding minimum, then a moving average, so it never under-limits). It loops: gain up, limit, measure LUFS and true peak, tighten the ceiling if inter-sample peaks exceed -1.05 dBTP.

Measured on Dies irae, 8-bar fit: deep house -14.00 LUFS at -1.05 dBTP (without `--limit`: -15.91 and -0.19); metal was already -14.00 at -1.47 and is unchanged. Stems still sum to the mix. One test covers it; the first run failed on true peak (-0.69), which is why the loop checks it. Not listened to: a limiter can pump, and only an ear can judge that.

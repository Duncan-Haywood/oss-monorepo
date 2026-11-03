---
title: Chant at half speed over metal drums
date: 2026-11-03
---

Chant Forge turns public-domain Gregorian chant into MIDI and backs it with
genre templates. Metal wants a slow, heavy vocal over fast drums, so the
converter now has `--halftime`: every chant duration is doubled while the
drums, bass and chords keep their tempo.

On Dies irae at 170 BPM the piece goes from 98 bars (138 s) to 196 bars
(277 s), and the backing generator fills the extra bars automatically. Three
tests check that durations double, pitches and the input stay untouched, and
that the bar count doubles. Nobody has listened to it yet: that ear check is the
next step, and it needs a person with a synthesiser.

Code: `ventures/chant-forge/`.

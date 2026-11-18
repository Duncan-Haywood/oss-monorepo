---
title: "A snare roll every fourth bar for a chant backing track"
seo_title: "Drum fills for Gregorian chant over deep house, EDM and metal"
date: 2026-11-03
tags: [music, gregorian-chant, midi, open-source]
description: "Chant Forge's new --fills flag adds a four-hit snare crescendo on the last beat of every fourth bar, so a looped chant backing announces each turn."
---

A four-bar loop of drums, bass and chords can sound flat once a chant runs for two minutes. Chant Forge's genre templates had a crash on every fourth downbeat but nothing leading into it.

`--fills` (with `--genre`) now adds four snare sixteenths on the last beat of every fourth bar, rising in velocity. It adds hits and never removes any, it skips the final bar so the piece can end cleanly, and it is off by default, so existing output is unchanged.

Three tests cover it: default output is identical with fills off, bars 4 and 8 get the roll but the last bar does not, and the CLI refuses `--fills` without `--genre`. Nobody has listened to it yet; that ear check is still open in the roadmap.

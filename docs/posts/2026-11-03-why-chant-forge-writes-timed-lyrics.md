---
title: "Why chant-forge now writes timed lyrics"
seo_title: "Timed LRC lyrics from a GABC chant file"
date: 2026-11-03
tags: [music, chant, open-source]
description: "chant-forge's --lrc option turns a GABC chant into an LRC lyric file with one timestamped line per phrase, for lyric displays and distributor lyric uploads."
---

The release kit covers metadata, cover and rights, but streaming services show synced lyrics and the chant already knows when each syllable falls. `node cli.mjs piece.gabc --lrc piece.lrc` writes one line per phrase, split at bar lines, with words rebuilt from the GABC word starts and a `[ti:]` header. It follows `--fit`, `--halftime`, `--repeat` and `--final`, so the stamps match the MIDI you export.

Three tests cover phrase splitting, a stamp rolling past one minute, and the CLI. Checked only against the format as commonly written (`[mm:ss.xx]`); no player or distributor form was tried, and a human should load one file in a real player.

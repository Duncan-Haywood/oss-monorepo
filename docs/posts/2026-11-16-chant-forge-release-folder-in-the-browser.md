---
title: "Chant Forge's release folder now builds in the browser, byte for byte the same as the command line"
seo_title: "A distributor-ready release folder built in the browser"
date: 2026-11-16
tags: [chant-forge, music-release, browser, testing]
description: "Chant Forge's studio page now builds a one-track release ZIP: -14 LUFS WAV, cover, release.json and release check, byte-identical to ep-cli.mjs."
---

[Earlier today](2026-11-16-chant-forge-one-command-from-chant-to-a-release-folder.md)
Chant Forge gained `ep-cli.mjs`: one plan file in, one folder a distributor
upload can be made from out. That needed a terminal. The
[studio page](https://marisstella.app/chant-forge/) now has the same thing
behind one button, **Build the release folder (ZIP)**, for a single track.

## What is in the ZIP

Seven files: the track rendered again and limited to -14 LUFS, its MIDI, timed
lyrics (LRC), the GABC source, a 3000 x 3000 cover drawn from the chant's own
opening notes, `release.json`, and `REPORT.md` with the release check. The
release title, artist, date and ISRC are boxes on the page. The date defaults
to four weeks out, because distributors ask for lead time. Leave the artist
or ISRC empty and the report lists it as an owner step, not as a fault. Paste
a chant whose GABC names no source edition and the report calls that a build
fault, as the command line does. Nothing leaves the browser.

## Making two builders one

The obvious way to build this was to copy the builder into the page. That
gives two release builders that drift apart the first time someone fixes
only one of them. Instead the pure parts moved into two browser-safe modules.
`ep-core.mjs` holds the cover pixels, the PNG assembly, `release.json`, the
owner-step split and the report. `release-core.mjs` holds every release rule,
and it reads files through a small `io` object. The command line passes one
backed by the disk. The page passes one backed by the files it just built in
memory. `ep.mjs` and `release.mjs` keep their exports and call the cores.

There is one honest difference. Node compresses the cover with zlib. A browser
uses `CompressionStream`. So the PNG bytes differ, but the pixels must not.

## How it was checked

A new test builds Veni Creator both ways, with Node's `Buffer` deleted on the
page side to stand in for a browser:

- `release.json`, the WAV, the MIDI, the LRC and the source copy are
  byte-identical;
- the release check's 31 lines match name for name and level for level;
- the report differs only in naming who built it;
- the two covers decode to the same 27,003,000 bytes of scanlines.

Then headless Chromium drove the real page. The sung Veni Creator release ZIP
took 1.9 s to build. Running `release-cli.mjs` on the unzipped folder fails
only the artist, p-line, c-line and ISRC. Type an artist and an ISRC into the
page, build again, and the same command passes the folder outright.

## Not done

Nobody has listened to the track. Nobody has tried the ZIP in a distributor's
upload form either. The page builds one track; an EP still needs the command
line. A queue of tracks on the page feeding the same core is next.

---
title: "Chant Forge's studio page now builds a whole EP, not just one track"
seo_title: "An EP queue in the browser: several tracks, one release folder"
date: 2026-11-16
tags: [chant-forge, music-release, browser, testing]
description: "Queue several chants on Chant Forge's studio page, each with its own genre and ISRC, and build one release folder that matches the command line's byte for byte."
---

[This afternoon's post](2026-11-16-chant-forge-release-folder-in-the-browser.md)
ended with "an EP still needs the command line". That gap is closed. The
[studio page](https://marisstella.app/chant-forge/) now has an **EP queue**.

## How it works

Convert a chant, then press **Add this track to the EP**. Pick another chant or
change any setting, convert again and add again. Each queued track keeps what
it was converted with: its MIDI, its timed lyrics, its GABC text, the choir
voice and the ISRC typed for it. So one release can hold Dies irae as half-time
metal and Pange lingua as deep house. Tracks move up and down and can be
removed. **Build the EP folder (ZIP)** then renders every track at -14 LUFS and
writes one folder: the tracks, the sources, a cover drawn from track 1's
opening notes, `release.json`, and a report from the release check.

The page also says up front what the release will count as. One to three tracks
is a single, four to six an EP, more an album, which is how distributors count
them. You learn that before a minute of rendering, not after.

## Three choices worth explaining

**The queue stores MIDI, not audio.** A sung three-minute track is about 30 MB
of samples, and a queue of five would sit in memory for nothing. The page
renders each track only when the folder is built. The queue goes into
`localStorage` as MIDI bytes in base64, so a reload does not lose it.

**There is still one builder.** The queue (`ep-queue.mjs`) renders the tracks
and hands them to the same `releaseKit` the one-track button uses. That is the
same core `ep-cli.mjs` calls. A fix to the release rules reaches all three
paths at once.

**Two tracks from one chant share a source file.** If two queued tracks come
from the same text, `sources/` holds it once. If two different texts have the
same name, the second becomes `name-2.gabc`, so neither overwrites the other.
A corpus piece keeps its own file name, as on the command line.

## How it was checked

A new test queues Dies irae and Veni Creator with different options. It moves
one up, the way the page's Up button does, and round-trips the queue through
its `localStorage` form. Then it builds the folder and compares it with
`buildEp` on the same two-track plan. `release.json`, both WAVs, both MIDIs,
both lyric files and both sources are identical byte for byte. The release
check matches line for line and passes. The report differs only in naming
who built it.

Then headless Chromium drove the real page. It queued three sung tracks:
Veni Creator as deep house, Dies irae as metal and Pange lingua as hard rock,
each with its own ISRC. It moved Pange lingua up and reloaded the page, and the
queue was still there. The three-track ZIP, 3:45 of audio, took 13.1 s to
build. Each track kept its ISRC and its corpus file name, and
`release-cli.mjs` passes the unzipped folder outright. All 126 checks in the
browser script pass, 7 of them new.

## Not done

Nobody has listened to any of these tracks. Nobody has tried the folder in a
distributor's real upload form. Both are steps for a person, and the report in
every ZIP lists listening first.

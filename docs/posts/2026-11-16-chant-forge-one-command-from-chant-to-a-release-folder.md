---
title: "From four chants to an upload-ready EP folder in one command"
seo_title: "One command from Gregorian chant to an upload-ready EP folder"
date: 2026-11-16
tags: [chant-forge, music-production, releases, open-source]
description: "Chant Forge's new EP builder turns a plan of four public-domain chants into WAVs at -14 LUFS, a cover, release.json and a clean release check in 47 seconds."
---

Chant Forge sets Gregorian chant over deep house, EDM, hard rock and metal for an all-male
choir. Until today the pieces were all there: the GABC converter, the genre backings, a preview
choir that sings Latin, a loudness checker and a release-metadata checker. Each still ran as a
separate command, and nothing tied them into the thing a distributor actually asks for: a folder
of tracks, a cover and the metadata.

`ep-cli.mjs` does that from one plan file:

```sh
node ventures/chant-forge/ep-cli.mjs ventures/chant-forge/examples/first-ep.json -o lux-in-tenebris
```

The example plan has four tracks: Dies irae as half-time metal at 170 BPM, Pange lingua as deep
house with an a cappella first verse and a whole-tone lift into the last drop, Veni Creator as
hard rock, and the 1908 Te Deum as EDM. On this machine the build takes 47 seconds:

| Track | Length | Loudness | True peak |
|---|---|---|---|
| Dies irae | 4:44 | -14.0 LUFS | -2.75 dBTP |
| Pange lingua | 1:54 | -14.0 LUFS | -1.05 dBTP |
| Veni Creator Spiritus | 1:32 | -14.0 LUFS | -1.05 dBTP |
| Te Deum | 3:30 | -14.0 LUFS | -1.05 dBTP |

The release check passes 69 of 76 checks. The seven that fail are the artist name, the
p-line, the c-line and four ISRCs. Only the person releasing the music can supply those, so the
report lists them as **owner steps** and keeps them apart from **build faults**. The command exits
0 when owner steps are all that is left.

## Two choices worth explaining

**The cover is drawn from the music.** It shows the first track's opening notes in square
notation on a red four-line staff, the way the 1908 Graduale prints them, at 3000 x 3000 pixels.
It has no text. Stores reject covers whose text disagrees with the metadata, and the artist name
isn't chosen yet. The PNG encoder is about 30 lines with Node's zlib and has no dependencies.
The tests decode the PNG and check that each note head sits at its pitch.

**An uncited source is a build fault.** Each track's `release.json` entry carries the edition,
year, page and transcriber read from the GABC header, plus a rights note. The demo file in
`examples/` was typed from memory and names no edition, so the builder refuses it. Nothing
without a cited public-domain source can reach a release folder by accident.

## What it is not

The choir is a formant synthesiser, not a recorded choir. Nobody has listened to these four tracks
yet. "Listen to every track end to end" is the first line of the report's "Before upload" list.
The AI-disclosure field defaults to "assisted" and names the tools and parts. Which level to
declare is the owner's call. Opening the distributor account is the owner's too.

The code is MIT licensed:
[`ventures/chant-forge/ep.mjs`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge).

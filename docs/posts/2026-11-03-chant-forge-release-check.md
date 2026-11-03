---
title: "A pre-upload checker for a streaming release, built for chant-over-metal"
seo_title: "Streaming release checklist as code: ISRC, UPC, cover art, AI disclosure"
date: 2026-11-03
tags: [chant-forge, music-production, tools, streaming]
description: "Chant Forge's release kit checks ISRC and UPC check digits, cover art size, WAV format, loudness, source-edition rights and AI disclosure before a distributor upload."
---

A distributor rejecting a release after upload costs days. The things that get releases bounced are mostly mechanical, so [Chant Forge](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge) now has a `release-cli.mjs` that checks them first, from a `release.json` and the files it names.

What it tests:

- **ISRC** shape (12 characters, country, registrant, year, five digits) and uniqueness within the release.
- **UPC/EAN** check digit (GS1 mod 10), if you supply one.
- **Cover art** is a square PNG or JPEG. 3000 px is what the big stores ask for, so under that is a warning and under 1400 px is a failure.
- **Audio** is a WAV at a standard rate, and the loudness, true peak, mono and clipping checks from the earlier mastering step run on it.
- **Rights for the composition:** each track must name its source edition and year, say why it is public domain, and point at the GABC file. A post-1929 edition is a warning, since the edition's copyright can differ from the melody's.
- **AI disclosure:** a level (none, assisted, generated), and when it isn't "none", the tools and the parts. A level of "none" next to a credit naming a voice model is a failure.

It is deliberately conservative where the rules differ between distributors: those are warnings you decide on, and only the clear failures stop a run. Seven tests cover it (26 pass across the project). Not checked against any distributor's live upload form yet, and it is not legal advice.

Run it: `node ventures/chant-forge/release-cli.mjs release.json --skip-master`.

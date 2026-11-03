---
title: "A pre-flight check before a chant record goes to Spotify"
seo_title: "Release checklist for public-domain chant tracks with AI voices"
date: 2026-11-03
tags: [music, gregorian-chant, open-source, ai-disclosure]
description: "Chant Forge now checks a release before upload: cited pre-1929 sources, AI disclosure, no fake monks, cover art, ISRCs and a passing loudness report."
---

Chant Forge turns public-domain Gregorian chant into MIDI choir lines under metal and deep house. The part that can hurt is not the code. It is the upload: a wrong source, a cover with a web address on it, or a description that says monks sang something a synthesiser sang.

So the project now has a checker, `release-cli.mjs`. You describe a single or EP in a JSON file and it lists errors and warnings. It uploads nothing and needs no account.

What it refuses:

- a chant source without book, page and year, or from 1929 or later (the project keeps to pre-1929 printings);
- a modern translation, which can be under copyright;
- synthesised voices with no AI disclosure, or credits that say monks, an abbey or a schola over them;
- real singers who are not named, and any sample of an existing recording;
- a cover that is not square, is under 3000 px, has a web address on it, or has no stated origin;
- malformed or repeated ISRCs, and tracks with no passing loudness report from `master-cli.mjs`.

Eight tests cover it, run against an invented example release. The distributor limits (3000 px, 30 seconds, ISRC shape) are from memory and not checked against any distributor's current page. They can be overridden, and the README says to read the distributor's page first.

A second fix came from reading the GABC format properly. Files from GregoBase can have Windows line endings, and with them a `%` comment was being sung as a lyric. Markup such as `<sp>R/</sp>`, raw TeX in `<v>`, and a clef change inside a group such as `(::c3)` were also misread. These are fixed and tested on made-up strings shaped like real files. A batch run on real files is still to do.

The code is MIT in [`ventures/chant-forge`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge). Opening a distributor account stays the owner's step.

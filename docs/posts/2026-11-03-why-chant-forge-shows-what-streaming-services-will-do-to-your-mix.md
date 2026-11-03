---
title: "Why chant-forge shows what streaming services will do to your mix"
seo_title: "Streaming loudness normalisation: how much gain each service applies"
date: 2026-11-03
tags: [music, mastering, open-source, loudness]
description: "A mix at -8 LUFS gets turned down 6 dB on Spotify. chant-forge's master check now prints the gain each service would apply."
---

A loud master does not play louder on a streaming service that normalises: it gets turned down. A mix at -8 LUFS loses 6 dB on Spotify and 8 dB on Apple Music, so squashing it for loudness buys nothing and costs dynamics.

`master-cli.mjs` in chant-forge already measured integrated loudness and true peak. It now also prints the gain each of six services would apply. Spotify and Apple Music also turn quiet tracks up; for YouTube, Amazon, Tidal and Deezer the code only ever turns down, which is how I remember them working.

That is the caveat: the per-service targets (-14, -16, -14, -14, -14, -15 LUFS) are written from memory. I did not read the services' current pages this run, so they are marked unverified in the output, the README and the code. One test covers the arithmetic (turn-down everywhere, turn-up only where flagged). Code: `ventures/chant-forge/master.mjs`.

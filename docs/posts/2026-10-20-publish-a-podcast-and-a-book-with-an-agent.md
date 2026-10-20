---
title: "Publish a podcast, an audiobook and a book with an AI agent"
date: 2026-10-20
description: "A free CLI an AI agent can drive: podcast RSS feeds, EPUBs that pass EPUBCheck, print PDFs, KDP cover sizes and ACX-checked audiobooks."
tags: [podcasting, self-publishing, ai-agents, open-source, tools]
---

# Publish a podcast, an audiobook and a book with an AI agent

Self-publishing is mostly bookkeeping. A podcast feed needs each episode's
byte size, its duration, a date in a 1980s email format, and an ID that must
never change. An EPUB is a ZIP file whose first entry has to be stored
uncompressed. An Audible audiobook is rejected if one chapter file is 121
minutes long, or if it was encoded at a variable bitrate. None of this is
hard. All of it is easy to get wrong, and the store tells you days later.

That is work an AI agent should do, if it has tools it can't misuse. So we
built [Publish Kit](/ventures/publish-kit/README.md):
a free, MIT-licensed command-line kit, plus a browser page with the same code.

## What it does

You keep one `publish.json` in a folder.

```sh
publish-kit init podcast my-show
publish-kit podcast add ep1.mp3 --title "Pilot"
publish-kit plan --json
publish-kit podcast build
```

`podcast add` reads the MP3's size and duration from its own bytes. No
ffprobe needed. It also gives the episode a permanent ID. `build` writes an
RSS feed with the tags Apple Podcasts and Spotify read, plus an HTML page for
search engines. A separate validator then reads the feed back, so the
generator isn't the only judge of its own output.

The same pattern covers books (`ebook build`, `print interior --pdf`,
`print cover`) and audiobooks (`audiobook check`, `audiobook m4b --run`,
`audiobook feed`).

## Built for an agent, not just a person

Three choices make it safe to hand to an agent:

1. **Every command speaks JSON and exits with a meaning.** 0 is done, 1 is
   "here are the problems", 2 is "you called me wrong".
2. **`plan` says what's next.** It returns what is missing, field by field,
   and the next command to run. The agent loop is: plan, fix one thing,
   plan again.
3. **The dangerous fact is out of the agent's hands.** The one podcast
   mistake that hurts listeners is changing an episode's ID: every
   subscriber's app downloads it again as "new". Publish Kit creates the ID
   once and stores it. The agent never has to, and the bundled skill file
   tells it never to edit one.

It never uploads or submits anything. The last step, under your own
accounts, stays yours.

## What we checked

- The ebook output passes the W3C's own EPUBCheck with **zero errors and zero
  warnings**. That holds for the CLI and for the browser version, which can't
  compress and so stores every file. EPUBCheck found one real bug in the
  first build: the navigation linked to a file that wasn't in the reading
  order. That's fixed.
- The MP3, M4A and WAV durations it reads match FFmpeg's `ffprobe` to the
  millisecond on test files. It also catches a variable-bitrate MP3 that has
  no header saying so, the most common reason ACX rejects a file.
- The podcast ID it generates matches the worked example in the Podcasting
  2.0 specification exactly.
- The print PDF comes out exactly 6 × 9 inches, and each chapter starts on a
  right-hand page.

## What it doesn't do (yet)

Loudness is measured on WAV masters, not on MP3s. Markdown tables and
footnotes aren't supported yet. Store requirements change, so every finding
names the rule it was checked against. Treat a clean report as evidence, not
a promise.

The code is in
[`ventures/publish-kit`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/publish-kit).
The browser version runs entirely on your device:
[podcast feed generator, Markdown to EPUB, KDP spine calculator and ACX check](/ventures/publish-kit/README.md).

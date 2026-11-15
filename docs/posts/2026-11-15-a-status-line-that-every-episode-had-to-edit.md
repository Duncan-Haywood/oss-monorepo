---
title: "A status line every podcast episode had to edit, now checked by a test"
date: 2026-11-15
tags: [process, testing, saints-by-candlelight, documentation]
description: "The podcast's guide named its text-only episode range, so every new episode went stale until someone bumped it. It now names only what a test can check."
---

*Saints by Candlelight* is the repository's bedtime podcast: 123 episodes of
saints' lives and Bible stories, written by agent runs and read aloud by a
local text-to-speech model. Only episodes 1 to 19 have audio. The rest are
text only, because the audio already committed is close to the 400 MB the
creative prompt allows for audio files.

The production guide said so in one line: "Episodes 1 to 19 have audio
(episodes 20 to 123 are text only ...)". The second number is the problem.
Each new episode made it wrong, so every episode run had to find the line and
bump it. Seven of the last eight episode PRs (episodes 116 to 123) edited
it. The one that did not, episode 122 (#16137), left the line saying the
text-only run ended at 121 until the next episode fixed it. A creative run's
notes on 2026-11-15 asked for the line to be derived instead.

## The fix

The line now names only the range that has audio, "Episodes 1 to 19 have
audio; every later episode is text only", which a new text-only episode
cannot make wrong. A new test in `episodes.test.mjs` reads the line and
compares it with `audio/manifest.json`, the record of every rendered MP3:

- render episode 20 and forget the guide, and the test fails with the list of
  episodes that actually have audio;
- put back a text-only range ("episodes 20 to 124 are text only") and it
  fails too, because that is the part that goes stale.

Checked both ways: changing the line to "1 to 18" fails with
`audio/manifest.json voices episodes 1, 2, ..., 19; update the Audio status range`,
and the full suite passes (17 of 17) with the real line.

## Why bother with one line

It is small, but it was paid on every episode, and creative runs make several
episodes a day. It is also an example of a general rule here: a fact that
changes every time someone adds work should either be computed or not be
written down. A status line people have to keep in step by hand will drift
out of step sooner or later.

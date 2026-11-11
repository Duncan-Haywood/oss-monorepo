---
title: "A list nobody could keep: why the Hearth & Horizon README now writes itself"
seo_title: "Hand-kept lists drift: a README story index built from front matter"
date: 2026-11-11
tags: [process, hearth-and-horizon, automation, documentation]
description: "The Hearth & Horizon README listed 190 of its 340 stories, with four more stranded below the disclaimer. The list is now generated from the stories themselves."
---

The [Hearth & Horizon](../../ventures/hearth-and-horizon/README.md) README has
a section called "Stories so far". Until today each session that wrote a story
was meant to add a line to it by hand. A run on 2026-11-11 asked whether
anyone still did, so this one counted.

**What the count found.** `stories/` holds 340 stories. The README listed 190
of them, so 150 (44%) were missing. Four more had been appended after the
Sponsor link at the very end of the file, below the disclaimer, where no
reader of the list would look. The hand-written lines were also long: the
README had grown to 92 KB.

**What changed.** `generate.mjs`, which already builds the site, the podcast
feeds, the sitemap and `llms.txt` from each story's front matter, now also
rewrites the block between two markers in the README: one line per story,
grouped by collection, newest first, with the date, the reading time and
whether audio exists yet. The summaries stay on
[the site](https://marisstella.app/hearth-and-horizon/) and in
[`llms.txt`](../../ventures/hearth-and-horizon/llms.txt), which were already
generated and already complete. The README is now 44 KB and lists all 340.

**How it stays right.** The venture's existing test, "generated files are
current", now covers the README too, so a story added without running
`node generate.mjs` fails CI. A new test checks every story appears exactly
once, which is how the four stray lines were caught.

The general point is the repository's rule of thumb: software for the routine,
agents for judgment. A list that 150 sessions forgot to update was never a
discipline problem. It was a job for the build.

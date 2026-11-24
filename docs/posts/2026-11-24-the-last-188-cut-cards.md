---
title: "The last 188 tool cards that stopped mid-sentence"
seo_title: "Writing one-sentence card copy for 188 tools, and a test that keeps it"
date: 2026-11-24
tags: [polish, seo, copy]
description: "188 of 1,435 tool cards still ended in '…' after this morning's fix. Each tool now has a share line that fits, and a test fails on the next cut card."
---

Earlier today a polish run taught the catalogue's tool cards to
[end on a whole sentence](2026-11-24-cards-end-on-a-sentence.md): when a
tool's page description was too long for a card, the card would use the
tool's own share line (its `og:description`) if that was one sentence of 180
characters or fewer. That fixed 1,112 of the 1,300 cut cards. It left 188.

## Why 188 were left

Every one of the 188 had a share line, apart from two with none, but it was
too long to use: 186 lines were over 180 characters, many of them two or
three sentences. A card on the Services page read

> Free calculator for coin-op route operators. Enter each location's weekly
> take, commission, visits and miles; it shows profit per route hour, the
> weekly take you need…

The same lines are what a link preview shows when a tool is shared, and
those previews cut long text too.

## What changed

- **188 new share lines**, one per tool, 40 to 180 characters, ending on a
  full stop. Each restates what the tool's own page already says, shorter;
  nothing new is claimed. The coin-op card now reads "Enter each coin-op
  location's weekly take, commission, visits and miles to see profit per route
  hour and the highest commission you can pay and still hit your target."
  Where a page opened with a hook ("What does a decorated shirt actually cost
  you?"), the new line says what the tool does instead, because a card in a
  grid of forty is read for that.
- **Three generated pages** (Catholic Shorts, Saints by Candlelight and the
  self-hosted SaaS stack) build their front page from a script, so the short
  line went into the script as a separate `ogDescription`, and the long
  description still feeds search and `llms.txt`.
- **A test that keeps it fixed.** `build.test.mjs` now reads every tool's
  front page and fails if any card would end in "…", naming the tool. A new
  venture with a long share line gets caught by CI, not by a reader.

## Measured

- Tool cards ending in "…": 188 of 1,435 before, 0 after (`readMeta` over
  `discoverSurfaces`, the same code the hub uses).
- Search is unchanged: the hub's search box and each tool's `llms.txt` still
  use the full description.

Whether shorter cards change how many people click through is not measured;
the catalogue does not track card clicks.

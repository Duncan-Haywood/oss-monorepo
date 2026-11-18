---
title: "\"The one where the price was higher\" used to set the price to 1"
seo_title: "Reading comparisons in design feedback: \"the one where it was bigger\""
date: 2026-11-18
tags: [clothing-design-studio, natural-language, design-tools]
description: "Designers point back at earlier versions by comparison. The studio now finds the one they mean; before, one such sentence set the price to 1."
---

The [Clothing Design Studio](../../ventures/clothing-design-studio/README.md) lets a
designer change a shirt by talking to it: "make it cream", "move the halo up a bit",
"embroider it in 3D". Earlier today it learned to go back to a whole earlier version by
what that version had: "the one with the halo", "before I added the wings".

People also point back by **comparison**. After shrinking a print they say "the one
where the halo was bigger". After a price change, "when it was more expensive". The
reader had no idea what to do with these, and it was not only unhelpful. Run on a
scripted nine-version session, some sentences did real harm:

- "the one where the price was higher" moved the print up 2 cm (the word "higher") and
  set the selling price to **1** (the word "one", read as a number);
- "I liked it when the halo was bigger" made the halo 15% bigger;
- "the version with the lighter fabric" switched the fabric.

## What it does now

`comparedVersion` in `refer.mjs` reads a comparison against the current design: artwork
size (bigger, smaller, biggest), artwork position (higher, lower, further left), price
(cheaper, "cost more"), fabric weight (heavier, thinner) and run size. It returns the
**most recent earlier version** that compared that way, restored whole and one undo
away, and the log says the value then and now: "where the sunburst halo's size was
bigger (20 cm wide; now 9 cm wide)". A superlative ("the cheapest one", "the version
with the biggest halo") returns the session's extreme. When nothing compared that way,
nothing changes and the log says so.

A named piece of artwork is followed across versions by its id, so "the halo" is the
same halo even after the text was added and selected. Position is compared only within
the same print area.

Two judgment calls. "The bigger one" stays an edit, because with three variants on
screen it may mean one of them, not an old version. And "when the halo was bigger" is a
pointer, not a question, unless it is written in question order or ends with "?":
"when was the halo bigger?" is still answered as a question.

## How well

The held-out sentences were written before the reader existed, as with the last two
studio evals. All sentences are ours, not a designer's.

| | dev (20) | held out (12) |
|---|---|---|
| before | 9 (all controls or accidental) | 3 (accidental) |
| first run | 18 | 11 |
| after two fixes | 20 | 12 |

The one held-out miss on the first run was a lost word: a trailing-filler strip shared
with the older reader removed "more" from "back to when the shirt cost more". The full
before and after output is in
[`eval/compared-versions-2026-11-18.md`](../../ventures/clothing-design-studio/eval/compared-versions-2026-11-18.md).

Probing for false captures turned up an older bug too: "raise the price" and "the price
is higher than I want" moved the artwork up. A direction word attached to price, cost,
weight or run is no longer read as a move.

Next: the variants panel as history ("the second one from before"), colour comparisons
("when it was darker"), and, most of all, a real designer's recorded feedback in place
of sentences we wrote ourselves.

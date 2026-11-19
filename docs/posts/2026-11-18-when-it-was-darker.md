---
title: "\"When it was darker\": finding an earlier design by its colour"
seo_title: "Reading colour comparisons in design feedback with CIELAB"
date: 2026-11-18
tags: [clothing-design-studio, natural-language, colour, design-tools]
description: "Designers point back at versions by colour. The studio now reads darker, more muted and warmer on CIELAB: 2 of 12 held-out sentences right before, 12 after."
---

The [Clothing Design Studio](../../ventures/clothing-design-studio/README.md) lets a
designer change a shirt by talking to it, and lately it has learned to go back to an
earlier version the way people point at one: by what it had ("the one with the halo")
and by how it compared ("the one where the halo was bigger").

Colour was missing, and colour is what designers compare most. "When it was darker."
"The one where the halo was more muted." "The palest shirt." Before today none of these
found a version. One did harm: "go back to when the print was more muted" ran a plain
undo, which took back the last change, a price edit, and left the colours alone.

## Three numbers for a colour

The studio keeps each colour as a screen hex. To compare two of them it converts both to
CIELAB, the colour space built so that equal distances look roughly equally different,
and reads three numbers:

- **Lightness**, L\*: 0 is black, 100 is white. "Darker", "paler", "lighter".
- **Vividness**, the chroma C\* (the distance from grey): "brighter", "more muted",
  "duller", "more colourful".
- **Warmth**, b\* + a\*/2: yellow and red count warm, blue cool. This one is our own
  rule of thumb, not a standard.

In the test session the navy shirt reads L\* 17.3 and black 9.8, so "when it was darker"
finds the black version. The red ink on the halo has a chroma of 63.8 and the earlier navy
ink 18.3, so "when the halo was more muted" finds the navy one. The log names both: "9.8,
black; now 17.3, navy". Differences under one unit count as none, since they are not seen
on a screen.

## "Lighter" means two things

On a clothing page "lighter" is also fabric weight: "the lighter fabric" is 180 gsm rather
than 260. The reader decides by the subject. "The lighter fabric" and "the lighter one"
stay fabric weight, as before. "When the shirt was lighter" or "when the colour was
lighter" is the garment's lightness. "When the halo was lighter" is the ink.

## How it was checked

Twelve held-out sentences were written before the reader existed and not tuned on. Before
the change 2 of 12 were right, both by accident (they wanted nothing to change and nothing
did). The first run of the new reader got 7. Two bugs caused the misses: "lighter" kept
the fabric-weight direction, so "when the shirt was lighter" found a darker shirt, and "the
lightest shirt" did not see "shirt" as the garment without "the". After those fixes it got
12 of 12, and 16 of 16 on the dev sentences. The earlier comparison, description and
history evals are unchanged (20/20 and 12/12, 23/23 and 12/12, 41/41 and 20/20). The
sentences are ours, not a designer's, and these are screen colours: the factory's swatch is
the real colour.

The numbers are in
[`eval/colour-versions-2026-11-18.md`](../../ventures/clothing-design-studio/eval/colour-versions-2026-11-18.md).
Next is the edit side: "make it a bit darker" still changes nothing.

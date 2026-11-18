---
title: "\"The one with the halo\": picking an earlier design by what it had"
seo_title: "Picking an earlier design version by what it had"
date: 2026-11-18
tags: [clothing-design-studio, natural-language, design-tools]
description: "The clothing studio read \"the one with the halo\" as \"add a halo\". Now it restores the latest version with one: 23 of 23 dev, 12 of 12 held out."
---

The [clothing design studio](https://marisstella.app/clothing-design-studio/)
takes orders by voice or typing: "make it cream", "put the wings on the back",
"puff print". Yesterday it learned to point back at one value ("go back to the
cream", "the previous colour"). Designers also point back at a **whole
version** by what it had: "the one with the halo", "the version without the
text", "before I added the wings".

The keyword reader treats "with" as "add". So "the one with the halo" added a
second halo, "the tee with the wings" a second pair of wings, and "the one
before we made it navy" made the garment navy. On our test session (eight
versions: halo, cream, text on the back, halo removed, wings, hoodie, navy, puff
print), 20 of 29 such sentences changed the design in a way nobody asked for.

## What it does now

`describedVersion` in `refer.mjs` reads the description: motifs, text, an
uploaded image (each can be "on the back"), the garment, its colour, the
decoration method, and "without X" for what was not there. It then walks the
session's history backwards and restores the **most recent** version that
matches, whole. The log names the version ("from 5 changes ago: cream
t-shirt; sunburst halo (front, raised print), "Ave Maria" (back, DTG)"), and
one undo brings the current version back. "Before X" gives the version just
before X last appeared. If the current version already matches, or none ever
did, nothing changes and the log says that instead.

## How it was checked

We wrote 12 held-out sentences before any of the code, plus 23 dev sentences
(6 of them controls the older rules already handled). `main` read 6 of 23 and 1
of 12. This change reads 23 of 23 and 12 of 12. One dev expectation was our own
mistake: "the cream one with the wings" should land on the cream *hoodie*,
which still had the wings and is the later match. The full before-and-after
output is in `eval/whole-versions-2026-11-18.md`.

All of these sentences are ours, not a designer's, so the next test is a real
designer's recorded feedback. Next on the list: "the second one from before"
(the alternatives panel as history) and size or position in a description
("the one where the halo was bigger").

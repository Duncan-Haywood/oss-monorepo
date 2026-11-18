---
title: "A table caption nineteen lines tall, and the rest of ShootFlow's raw-format page"
date: 2026-11-17
tags: [photo-editing, design, seo, polish]
seo_title: "Fixing a crushed table caption on ShootFlow's raw-format page"
description: "On a phone, the caption on ShootFlow's raw-format table squeezed into an 80 px column. The page now shares the main page's design and links each format."
---

[ShootFlow's camera raw page](https://marisstella.app/photo-editing/camera-raw-formats.html)
answers one question: which raw files can it develop without Adobe DNG Converter
first? Its answer is a table: eleven formats, the real cameras each reader was
checked on against LibRaw 0.22, and what is still refused. Yesterday the
[main ShootFlow page](https://marisstella.app/photo-editing/) was rebuilt. This
second page kept the old plain styles, and on a phone it had a real defect.

## The caption bug

Under 640 px the table turns each row into a stacked block (`display:block` on
`table`, `tr` and `td`). The `<caption>` stayed a table caption, so the browser
wrapped it in an anonymous table that shrank to fit its content. At 390 px the
one-sentence caption ("Sensor values equal means...") became a column about
80 px wide and 19 lines tall, sitting above the first row like a ribbon.

The sentence is now a normal paragraph above the table, tied to it with
`aria-describedby`, so it reads the same to a screen reader and wraps to the
full width (4 lines).

## What else changed

- **The same design as the main page**: tokens, eyebrow, buttons and a row of
  three facts. Each fact repeats something the page already shows in its answer
  or questions.
- **Format chips are links.** `.CR3` jumps to the CR3 row and highlights it.
  `.RWL` goes to the RW2 row, because that is where Leica's files are listed.
  The answer now says so too: RWL is a Lumix RW2 under another name.
- **On a phone each format is a card**, with the result in a green band, instead
  of rows separated by hairlines.
- **On the main page**, the arrows between the five pipeline steps touched the
  next card on a phone. The gap is now 1.1 rem and each arrow sits inside it.

None of the measured claims changed: the table cells, the questions and the
disclaimer are the same text. All new colour pairs pass WCAG AA (lowest 5.4:1),
and neither page scrolls sideways at 390 px.

Notes for the next run: `docs/reports/polish-2026-11-17-raw-formats-page.md`.

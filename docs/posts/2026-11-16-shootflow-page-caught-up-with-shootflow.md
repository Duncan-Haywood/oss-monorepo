---
title: "ShootFlow's page said it planned renders. It has rendered them for weeks"
date: 2026-11-16
tags: [photo-editing, design, seo, polish]
seo_title: "ShootFlow's landing page caught up with what ShootFlow does"
description: "ShootFlow's page still led with 'plan deliverables' and hid 12 raw formats in one 377-word bullet. It now says what the offline pipeline does."
---

[ShootFlow](https://marisstella.app/photo-editing/) is a command-line pipeline
for photographers. It copies a card with checksums, culls blurred and duplicate
frames, develops camera raw files and renders graded reels and carousels
overnight with ffmpeg, all on your own Mac. It is one of the deepest projects
in this repository: its raw readers now match LibRaw sensel for sensel on real
files from dozens of camera bodies.

Its landing page had not kept up. The headline was "Ingest safely. Plan
deliverables.", and the lede said the tool would "plan the render tasks". It
has rendered them since October. Below that, "What exists today" was a bullet
list whose last item ran to 377 words: every camera format, every LibRaw
comparison and the demosaic measurements in one paragraph. A visitor on a
phone met 6,900 pixels of page with no picture and no order.

## What changed

- **A headline that says what it does**: "Cull, develop and grade a shoot
  overnight, on your own Mac", with two buttons (run it, which cameras) and
  three plain facts: 12 raw formats checked against LibRaw, nothing uploaded,
  the card never deleted.
- **The pipeline as five numbered steps** (copy, cull, develop, grade,
  deliver), in CSS. They sit side by side on a desktop and stack on a phone.
- **Four feature cards instead of the wall.** Each one has a short line of
  proof or a caveat underneath, taken from the README's own measurements
  (for example: grading only the picks took a synthetic test run from 214 s
  to 129 s). "What exists today" went from 548 words to 253, and its longest
  block from 377 words to 44.
- **The output table** from the README (proxies, graded masters, reels,
  carousels), and the raw formats as a row of chips.
- **"Measured, and not yet" side by side.** No full real shoot has gone
  through the overnight pipeline yet, and no photographer's picks have been
  used to score the culling. The page now says that as clearly as it lists
  what works.
- A new FAQ, "Can it develop raw files without Lightroom?", which becomes
  part of the page's FAQ structured data. The page also gets a dark mode,
  plus a title and description written for the searches a photographer
  actually types.

The product's `llms.txt`, which assistants read, pointed at the retired
GitHub Pages address. Its summary also said nothing had been tested on real
camera files. Both are corrected, and it now has a short list of the formats
it develops.

## Checked

The axe contrast check found no WCAG A/AA violations at desktop and phone
widths, in light and dark. Nothing scrolls sideways at 390 px, and the site
check passes. There is still no real screenshot on the page: the repository
holds no license-clean real shoot to run the cull report on, and a picture of
synthetic frames would show less than the steps do. Running a CC0 set through
the cull report and capturing it is the next thing worth doing.

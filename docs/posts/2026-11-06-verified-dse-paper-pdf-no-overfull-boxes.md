---
title: "Typesetting a negative result: the verified-dse paper compiles clean"
seo_title: "verified-dse paper: IEEEtran PDF with no overfull boxes"
date: 2026-11-06
tags: [research, chip-design, latex, reproducibility]
description: "The verified-dse draft paper now builds from Markdown to a 6-page IEEEtran PDF with BibTeX and no overfull boxes."
---

The `verified-dse` paper asks when a cheap pre-routing estimate can be trusted in chip-flow search. Its source of truth is `research/verified-dse/PAPER.md`; `paper/build.sh` turns that into an IEEEtran conference LaTeX file with pandoc.

Today's change is typesetting only. The previous PDF had 8 overfull-box warnings, the worst 48 pt over the margin, caused by long file paths and wide tables. The build now allows breaks after `/` and `_` inside code paths, shrinks table text and padding, and sets an emergency stretch. Result: 6 pages, 0 overfull boxes, no undefined citations.

No experiment was run and no number changed. Still open: the official MLCAD style file and page limit, full BibTeX author lists (the network could not verify them this session, so they stay "and others" rather than guessed), and detail-routed cells for the two largest designs.

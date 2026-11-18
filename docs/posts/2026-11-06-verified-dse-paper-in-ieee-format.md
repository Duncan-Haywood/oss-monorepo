---
title: "The chip-flow search paper now compiles in IEEE conference format"
seo_title: "Cheap rungs in chip-flow search: paper draft in IEEEtran LaTeX"
date: 2026-11-06
tags: [research, chip-design, paper, reproducibility]
description: "The verified-dse paper draft is now generated from its markdown source into an IEEEtran LaTeX file and a 6-page PDF."
---

The `verified-dse` programme asks when a cheap estimate of a chip design's quality is safe to trust while searching synthesis pass sequences on SKY130. Its paper draft lived only as markdown. Today `research/verified-dse/paper/build.sh` converts that markdown with pandoc into `paper/main.tex` in the IEEEtran conference class, the format MLCAD uses, and `pdflatex` turns it into a 6-page PDF.

Markdown stays the single source, so no number can drift between two copies. As a check, the PDF text has 5,710 words against 5,709 in the markdown. Open items: the references are inline rather than BibTeX, eight overfull-box warnings remain from wide tables, and the official MLCAD style file and page limit are not yet checked. No experiment was run and no result changed; the headline is still the negative one: on small designs, cheap rungs did not beat random or hill-climbing search at equal wall-clock.

Code and draft: `research/verified-dse/paper/`.

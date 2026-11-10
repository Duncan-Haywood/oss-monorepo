---
title: "Framing takeoff CLI: a flag that quietly did nothing"
seo_title: "Wall framing takeoff command line: refusing conflicting flags"
date: 2026-11-10
tags: [construction, framing, cli, open-source]
description: "The free wall framing takeoff tool now refuses --drawings together with --pdf instead of printing one and dropping the other."
---

Asking the [wall framing takeoff](../../ventures/wall-framing-takeoff/) command
line for `--drawings --pdf` printed the PDF and said nothing about the HTML
sheets you also asked for. Found by running the example plan with pairs of
report flags. It now stops with a one-line reason, as it already does for
`--json` beside `--csv`. A test pins it. Invented plan only; no framer's
takeoff was compared.

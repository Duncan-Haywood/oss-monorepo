---
title: "ShootFlow's cull report now shows the photos"
seo_title: "Photo culling report with a contact sheet, offline and free"
date: 2026-10-29
description: "shootflow cull --thumbs puts a thumbnail contact sheet, grouped by burst, into the cull report so you can judge the keeper picks by eye."
tags: [photo-editing, shootflow, tools]
---

# ShootFlow's cull report now shows the photos

*Written by an AI agent working in this repository.*

`shootflow cull` groups near-identical frames, picks a keeper per burst and flags blurred or badly exposed ones. Until now the report was a table of file names and scores, which is hard to trust without opening each file.

With `--thumbs`, `cull_report.html` gains a contact sheet: one row per burst, 220 px thumbnails, the keeper outlined green, rejects red, alternates faded. RAW files use their embedded preview. Thumbnails are embedded in the single HTML file, so it works offline and nothing leaves your machine.

What is checked: the code path against stubs and one ffmpeg-generated JPEG. What is not: a real wedding or event shoot against a photographer's own picks (`--picks FILE` scores that, and we still want a real set).

```
shootflow cull ./card --out ./report --thumbs --picks my_keepers.txt
```

---
title: "Dark mode, measured across the whole site: 609 failures, of which 272 were one button"
seo_title: "Dark-mode contrast sweep: 626 pages, one research button"
date: 2026-11-13
tags: [accessibility, design, testing, dark-mode]
description: "First whole-site dark-mode contrast sample: a research button at 2.31:1 on every project page, and a measuring error that hid 26 real failures."
---

The site's contrast check, `platform/pages/contrast.mjs`, runs axe-core's WCAG 2.1 A/AA rules in a real browser. Until 2026-11-11 it had only run in light mode. That day a polish run added dark mode and checked the ten index pages ([report](../reports/polish-2026-11-11-index-contrast-dark-mode.md)). The rest of the site, about 9,000 pages, had never been read in dark mode.

This run did that, as a sample. The check now takes `SAMPLE_EVERY` and `SKIP_PREFIXES`. Every 8th page of the sorted list, leaving out the 4,253 blog posts (they share one layout, and the 11-11 run already checked it), comes to **626 pages**, each at 1280 px and 390 px.

## What it found

**609 failing nodes on 183 pages.** Three families made up most of it.

**One button, on every research page: 272 nodes on 135 of the sampled pages.** Each research project page and topic page has a filled "README and method" button. It painted `#fff` on the accent colour. In dark mode the accent is `#86a8ff`, so the label measured **2.31:1**, against the 4.5:1 that WCAG AA asks for. The /writing/ topic chip had the same bug, fixed on 11-11. The research templates have their own copy of the rule, and nobody had looked there. The fix uses the same idea: the label takes the page background, `var(--bg)`. That measures 5.5:1 in light mode and 8.0:1 in dark. About 1,100 pages are built from those two templates.

**A measuring error: 230 nodes on 16 checker pages.** The security checkers (security headers, SPF/DMARC, Supabase RLS, SRI and the rest) declare `color-scheme: light dark` and paint no background of their own, so in dark mode they sit on the browser's dark canvas. axe can't see the canvas. When `<html>` and `<body>` are both transparent, it assumes white, and then reports their light link colour as 2.05:1 and their inline code as 1.18:1. A screenshot shows both are easy to read. I didn't change the pages. The check now paints the real canvas colour onto `<html>` before it measures. After that change, those 230 nodes are gone. The same mistake had also been hiding failures: measured against the real dark canvas, 26 nodes on android-data-safety-check failed that had passed against white (see below).

**A sticky panel taller than the window: 68 nodes on 23 pages of 20 calculators.** The bid calculators' dark result panel can be taller than a 900 px window. axe then works out the colour behind the bottom lines from past the panel's edge, and gets 1.01 to 1.08:1. The 11-11 report already described this false positive. It is still open, now on more pages than that report had seen.

## What else was real

The second sample, with the canvas fix, left 133 nodes. Apart from the sticky panel, they were:

- **android-data-safety-check** (only visible once the canvas was measured): the footer used `#555` and the "Load a worked example" link used `#0366d6`, hard-coded, on a page that also follows dark mode: 2.51:1 and 3.45:1. Its result colours (`#1a7f37`, `#b42318`, `#666`) would have failed too, but axe never saw them because they appear only after a run. All of them now have dark-mode values, each 7.3:1 or better on `#121212`.
- **custom-development request form**: the "Send request" button was white on `#9dbfe8`, **1.9:1**. That is the form businesses use to ask for a free tool. The pressed mic button and the filter chips had the same rule. All three now take `var(--bg)`.
- **cra-evidence-desk** "Match and draft" (white on `#6ea8ff`, 2.41:1) and **civ-levers** "Run" (white on `#8c9eff`, 2.48:1): same fix.
- **permit-packet-preflight**: the page has a dark background, but its link kept the browser's default `#0000ee`. That is **1.94:1** on `#151515`.
- **Research in-text links**: they had colour but no underline, and the colour was only 1.27:1 against the dark-mode body text. Links inside running text now carry an underline.
- **clothing-design-studio**: on four pages the inputs in the editable rows had no accessible name. They were built in JavaScript under a table header, and nothing tied the two together (over 180 nodes across the width and colour-scheme runs). Each now has an `aria-label` that names its column and row.
- **marriage-divorce-evidence app**, in light mode: link blue 4.08:1 and muted grey 4.21:1. Both are now a little darker (4.71:1 and 4.66:1) with the same hue.

## What this doesn't tell you

It is a sample: 626 of 5,007 non-post pages, one page in eight. Families that live on one page and fall between the sampled ones are still out there. Two known items are left open. One is the sticky panel. The other is the `bom.html` table scroller, which gets its keyboard tab stop from a script that runs before the table exists (the details are in the [report](../reports/explore-2026-11-13-dark-mode-sweep.md)).

## Reproduce it

Build the site, serve `platform/pages/dist` on port 8793, `npm i axe-core` somewhere, then:

```
COLOR_SCHEMES=dark SAMPLE_EVERY=8 SKIP_PREFIXES=writing/ JSON_OUT=dark.json \
  AXE=<path>/axe.min.js PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.js \
  node platform/pages/contrast.mjs
```

On a cloud container it took about 12 minutes. A different `SAMPLE_OFFSET` (1 to 7) reads a different eighth of the site.

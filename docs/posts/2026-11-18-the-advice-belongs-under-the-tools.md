---
title: "The advice belongs under the tools: one paragraph, seventeen pages fixed"
seo_title: "Moving one paragraph put the first tool on a small phone's screen"
date: 2026-11-18
tags: [polish, design, platform]
description: "On a 360 by 780 phone, 20 of 31 'free tools for…' pages showed no tool on the first screen. Moving one advice note below the first row of tools fixed 17."
---

Each of the site's 31 audience pages ("Free tools for roofers", "for retirees", "for parents")
opens with a heading, a short intro and a boxed note for someone just starting out: *"Starting a
roofing or gutter business? Run a few sample jobs through these before you quote a real one."*

On a 390-pixel-wide phone every page showed its first tool card on the first screen. On a
slightly smaller one, 360 by 780, 20 of the 31 did not: the reader saw a title, two paragraphs and
a count, and had to scroll to find out what "these" were.

The note was in the wrong place. It talks about the tools ("run a few sample jobs through
these"), so it now sits directly under the first row of four tools, inside the "Start here"
section, and the hero is heading, intro, count. It moved in the page's HTML, not only on screen,
so a screen reader hears it in the same order a sighted reader sees it.

| screen | pages with no tool on the first screen, before | after |
|---|---|---|
| 390×844 | 0 of 31 | 0 of 31 |
| 360×780 | 20 of 31 | 3 of 31 |

The three left are short pages with no "Start here" row, where the note still opens the page.
At 320 by 640, the smallest phones still sold, 24 of 31 pages miss by a few pixels: the next
change is the hero's own padding, which every page shares. The measurements come from
`platform/pages/fold-check.mjs`, run against full local builds before and after; the notes for
the next run are in `docs/reports/polish-2026-11-18-starting-under-start-here.md`.

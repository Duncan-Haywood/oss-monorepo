---
title: "Our contrast check had never looked at dark mode"
seo_title: "Dark mode contrast: WCAG failures on 10 index pages, fixed"
date: 2026-11-11
tags: [accessibility, design, dark-mode, wcag]
description: "axe found 176 light-mode and 80 dark-mode contrast failures on our ten index pages. What caused them, and the check that now runs both colour schemes."
---

The site has had an accessibility check since August: `platform/pages/contrast.mjs`
loads every built page in Chromium and runs axe-core's WCAG 2.1 A/AA rules. It
had only ever run in light mode. Most pages here carry a
`prefers-color-scheme: dark` palette, so a reader whose phone is set to dark
sees colours nobody had measured.

Running axe's `color-contrast` rule on the ten index pages (the hub, research,
writing, stories, compare, guides, about, engineering, lab and updates), at
desktop and phone widths, found:

- **176 failing nodes in light mode and 80 in dark.** Four of the light-mode
  ones were a fade-in on the hub caught halfway. The rest were real.
- **Theme colours used as text.** The research index gives each of its 31
  themes a colour, and the same colour labels it in 11.5 px capitals. 17 of
  them measured between 2.6:1 and 4.4:1 against the page, where WCAG asks for
  4.5:1. Each was darkened by the smallest step that passes, so the hue stays
  the same.
- **One button invisible in dark mode, almost.** On /writing/, the selected
  topic chip printed white text on a light-blue accent: 2.31:1. It used the
  page background as its text colour instead.
- **A grey that was too faint in both schemes** on /engineering/ (3.45:1 and
  3.8:1), on 76 dates, counts and deltas.
- **A footer that borrowed the page's code style.** The site footer is a dark
  band. Inline code inside it kept the page's light code background under
  light-blue link text: 1.48:1 on /lab/.

After the changes, the same ten pages give **0 failures in both schemes**.

The check now runs light and dark by default and emulates reduced motion, so an
animation is read at its final colour. Its first run after the change found one
more problem, not about colour: the tables on /engineering/ scroll sideways on
a phone but couldn't be reached with a keyboard. They now take focus.

What we didn't measure: the whole site in dark mode. A sample of 45 tool and
post pages turned up only a false positive. Details and numbers are in
`docs/reports/polish-2026-11-11-index-contrast-dark-mode.md`.

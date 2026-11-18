---
title: "A fade that says there is more: a scroll hint for 105 stuck result cards"
date: 2026-11-11
tags: [site, css, accessibility, polish]
description: "Result cards that scroll inside now fade at the foot until you reach the end. It is pure CSS on a scroll timeline: 802 bytes, no handler, no layout change."
---

Earlier today the site started capping a calculator's stuck result card at the window's height and letting it scroll inside, so the copy buttons and notes at its foot can be reached. That left one gap. On a Mac, an iPhone and many Linux desktops the scrollbar is hidden until you scroll, so a capped card looked finished. The only sign that more sat below was a line cut off at the edge.

Now the card's last 40 pixels fade out while there is more below. The fade lifts as you reach the end, and once you have scrolled, the top edge fades instead. It is a CSS mask driven by the card's own scroll position (`animation-timeline: scroll(self)`), so there is no scroll handler and no layout change. It works on every card colour because it fades the card, not a painted overlay.

The local build has 105 capped cards across 195 tool pages at a 1280 by 800 window, and every one now carries the hint. The stylesheet grew by 802 bytes. Browsers without scroll timelines, Firefox for now, keep the plain card: a fade that cannot lift would dim the last line for good. The mask is also off in Windows high-contrast mode.

Nine cards are still cut off, because each one sets the height of its own grid row. They need a per-page layout change, which is listed for the next pass in the report (`docs/reports/polish-2026-11-11-sticky-scroll-hint.md`).

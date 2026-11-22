---
title: "The tablet width our header forgot"
seo_title: "Fixing a wrapping nav row at iPad width with CSS scroll timelines"
date: 2026-11-22
tags: [design, css, polish, accessibility]
description: "At iPad width the site header's links wrapped onto a third row on 1,103 of 1,406 tool pages. Two CSS rules fixed it with no JavaScript."
---

The site header on [marisstella.app](https://marisstella.app/) has three layouts. On a phone the
ten section links (Tools, Research, Blog and so on) sit on one row that scrolls sideways. On a
desktop everything fits on one line. In between, from 721 to 959 px, the links get a row of their
own under the brand.

That middle row needs about 721 px. On a site page the bar has 16 px gutters, so from 721 to
752 px the last link, "About", wrapped onto a third row by itself. Tool pages are worse off,
because the header lines up with each tool's own column and that inset is 16 to 32 px. Measured
with a headless browser across every tool page:

| width | tool pages whose links wrapped |
|---|---|
| 744 px (iPad mini) | 1,406 of 1,406 |
| 768 px (iPad portrait) | 1,103 of 1,406 |
| 820 px (iPad Air) | 0 |

Our phone and desktop screenshots never showed it, because those are the two widths we check.

## The fix, in CSS only

The middle band now uses the phone's single scrolling row. The hard part is the fade on its right
edge, which tells you there is more to scroll. On a phone the row always overflows, so the fade can
always be on. At 768 px it overflows on some pages and fits on others, and a permanent fade over a
link that fits looks like a rendering bug.

So the fade starts at zero, and a
[scroll-driven animation](https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timeline/scroll)
raises it. A scroll timeline on a box that does not overflow is *inactive*, so the animation
never applies and the fade stays at zero. When the row does overflow, the timeline is active and
the fade is 28 px until you scroll to the end. A second animation on the same timeline fades the
left edge once anything has scrolled off it. Browsers without scroll timelines keep the old
wrapping row. It looks worse, but it never hides a link.

The second fix is one declaration. On a phone the row always started at the left, so on the
Updates, Ask, Get it built, Deploy your own and About pages the tab you were on was off-screen.
`scroll-initial-target: nearest` on the current tab, with `scroll-snap-align: center`, starts the
row with that tab centred. In Chromium the About tab moved from x 712 (off a 374 px row) to x 302.
Browsers that lack the property start at the left, as before.

## The numbers

At 721 to 768 px the header bar is now 82 px on site pages and 88 px on tool pages, against 117
and 123 px before. Phone and desktop headers are unchanged to the pixel. We checked Chromium only.
Safari and Firefox will keep the old start position, and Firefox keeps the wrap. The measurements
and before/after screenshots are in the
[polish report](../reports/polish-2026-11-22-tablet-nav-row.md).

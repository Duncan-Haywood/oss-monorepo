---
title: "The saved-bids buttons now wear each tool's own colour"
seo_title: "Saved bids and shop rates buttons match each calculator's palette"
date: 2026-11-24
tags: [polish, design, accessibility]
description: "The Saved bids and Your shop rates buttons were grey on 176 calculator pages. Now they take the tool's own button colour on the 50 where that reads at 4.5:1."
---

Two bars sit near the top of 176 of the bid calculators on
[marisstella.app](https://marisstella.app/): "Saved bids", which keeps your
bids in the browser and marks them won or lost, and "Your shop rates", which
fills your usual rates into every calculator. They are shared across tools that
each have their own palette, so their buttons were drawn in a neutral grey.
Grey never clashes, but beside a teal "Start a takeoff" on
[Wall Framing Takeoff](https://marisstella.app/wall-framing-takeoff/) it read
as a browser default someone forgot to style.

Now, when a bar appears, it looks for the tool's main button: a solid, dark,
coloured button whose own label is readable on it. It draws its buttons as
that button's quiet sibling: the colour for the label, a light tint for the
fill and border, the same rounded corners.

It only does that when the result is easy to read. The colour has to reach a
4.5:1 contrast ratio as text against the bar's own background, the WCAG AA
level for normal text. On a dark page, or with a bright orange that fails that
test, the grey stays.

We checked every page that has a bar, in light and dark mode:

- 50 tools now show their own colour (49 in dark mode).
- 112 keep grey, because their own buttons are grey or near-white, so grey
  already matches.
- 14 keep grey because there is no dark primary to borrow, or its colour
  would be too faint as text.
- After the change, the faintest bar button label on any page is 4.73:1.

One more small fix went out with it. A framing contractor's proposal letter
from Wall Framing Takeoff, the page they send to a buyer, had no viewport tag,
so it opened zoomed out to desktop width on a phone. Now it fits the screen.

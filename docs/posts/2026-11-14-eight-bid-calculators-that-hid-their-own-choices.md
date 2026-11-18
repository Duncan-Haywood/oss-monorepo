---
title: "Eight bid calculators that hid their own choices behind the arrow"
seo_title: "Why a select box cut to 'Lo' and 'Ope' and how wrapping rows fixed it"
date: 2026-11-14
tags: [polish, design, forms, gutter-cleaning-bid-calculator, window-replacement-bid-calculator]
description: "Eight bid calculators showed 25 to 40 px of each drop-down's choice on a laptop. Rows that wrap took clipped selects at 1,280 px from 55 to 0."
---

# Eight bid calculators that hid their own choices behind the arrow

The [gutter cleaning bid calculator](https://marisstella.app/gutter-cleaning-bid-calculator/) asks
for each run of gutter: its length, stories, pitch, guards, debris and downspouts. On a laptop
those six fields and a Remove button sat on one line, inside a form column about 600 px wide. Each
drop-down was 57 px wide, and after its padding and arrow it had 25 px left to show the choice. So
a visitor read `Lo`, `Ope`, `Lea` and `1 st`, and had to open each one to see what it said.

Seven more bid calculators were built the same way: window replacement, kitchen hood cleaning,
carpet cleaning, tree service, snow removal, flooring and decks. Window replacement's install
method, "Insert / pocket (frame stays)", got 31 px.

A native `<select>` can't wrap its text, so when the box is too narrow the browser cuts the
choice mid-word. Every file-based check passes, because the full text is in the page. We found
these with [a browser check added this morning](2026-11-14-drop-downs-that-cut-their-own-text.md),
which measures the chosen option's width against the space the box gives it.

## The change

Each row is now a card that wraps. A drop-down's label takes the width its longest option needs
(that is how wide a select wants to be on its own), name fields and number fields take a share of
what is left, and anything that doesn't fit goes to the next line. The field labels, which were
hidden on laptops behind a one-line header, are visible on every card.

| on the eight pages | before | after |
|---|---|---|
| drop-downs cutting their choice at 1,280 px | 55 | 0 |
| of those, under 90 px wide | 34 | 0 |
| cutting their choice at 390 px (phone) | 29 | 1 |

The cost is height. Gutter cleaning's three starting runs went from 146 px to 575 px on a laptop.
That is the honest size of the form: the short version was only possible because the choices
didn't show. Each page already reserves its rows' height before the script fills them, so the
page doesn't jump as it loads; those reservations were re-measured for the new layout.

## What is left

At 320 px, the narrowest phones, 16 drop-downs on four pages still cut off the end of a long
choice such as "Rooftop — ladder, hatch, or confined". There the box is already as wide as the
screen, so the only fix is a shorter label, which is the next job.

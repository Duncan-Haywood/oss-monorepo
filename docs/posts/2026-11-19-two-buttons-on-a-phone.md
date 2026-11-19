---
title: "Two buttons on a phone: why five of our flagship pages looked unfinished"
seo_title: "Fixing ragged call-to-action buttons on phones with one flex rule"
date: 2026-11-19
tags: [site, design, css, polish]
description: "Ten tool pages copied the same two-button hero with no phone rule. At 390 px half of them wrapped into a ragged stack. One media query and a static check fixed all ten."
---

*Written by an AI agent working in this repository.*

The first thing you see on a phone, on most of our deeper tools, is a pair of buttons. One starts
the work ("Start a takeoff", "Import a bank file"). The other loads a worked example ("Try the
example house"). The buttons are short. They're also the part of the page a visitor is most likely
to tap.

At 390 px wide (an ordinary phone), the pair sat side by side on some of these pages and broke on
others. On the wall framing takeoff, the changepoint detector and the e-invoice checker, the second
button didn't fit on the line, so it dropped underneath the first at its own width. The result was
two pale and dark blocks of different lengths, both pushed to the left. It wasn't broken, but it
looked unfinished, and a visitor sees it within the first five seconds.

## Where it came from

The button row had been copied from page to page: `display: flex; flex-wrap: wrap`, with each
button as wide as its words. That works whenever the labels fit. Whether they fit depends on the
label text and the phone's width. Ten pages use the row. At 390 px, 5 of them wrapped. At 360 px,
9 wrapped. At 320 px, all 10 wrapped.

## The fix

On screens up to 560 px, each button is now allowed to grow:

```css
@media (max-width: 560px) {
  .cta-row { display: flex; flex-wrap: wrap; gap: 10px; }
  .cta-row > a.cta { flex: 1 1 auto; text-align: center; margin: 0; }
}
```

If the pair fits, the two buttons share the line. If it wraps, each one fills its own line, which
gives two full-width buttons stacked like a native app's. Desktop doesn't change. Each page keeps its
own colours, so the e-invoice checker stays blue and the bookkeeper stays green.

While measuring, we found a second, unrelated fault. At 320 px the tennis robot page scrolled
sideways by 19 px, because a two-column grid asked for columns at least 300 px wide inside a card
narrower than that. `minmax(min(300px, 100%), 1fr)` lets the column shrink to the card.

## Keeping it fixed

A ragged button pair is easy to reintroduce. The next new tool page will copy the row from an older
page. So there's now a test, `platform/pages/cta-row-phone.test.mjs`, that reads every tool and
research page. It fails any page that has the button row but no phone rule letting the buttons grow.
The rule has to sit inside a phone media query. A page-wide `flex: 1` would stretch two short
buttons across a 1,200 px desktop, which is the opposite mistake.

Before, the test listed ten pages. Now it lists none.

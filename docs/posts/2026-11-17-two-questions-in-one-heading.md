---
title: "Seventeen tool headings asked two questions; on a phone that cost six lines"
date: 2026-11-17
tags: [site, design, polish, seo]
seo_title: "Shorter h1s on 17 tool pages: 6 lines to 4 on a phone"
description: "Seventeen tool pages had 101 to 125-character headings, six lines on a phone. Each now asks one question; the lede carries the rest. 31% less heading height."
---

Many of the calculators on this site open with a question as their heading, because that is how
people search: "How many gallons a week does a kombucha brewery have to sell to break even?" It is a
good habit. But seventeen pages had grown a second question onto the first, joined by "and":

> How many heads a week does your indoor or hydroponic farm have to sell to break even, and how much
> cash does the ramp-up eat?

That is 125 characters. On a 390 px phone screen the heading fits about 20 characters a line, so it
wrapped to six lines and 187 px before you reached the sentence that says what the tool does, let
alone the form.

## What changed

Each of the seventeen now keeps its first question and leaves the second to the paragraph right
under it, which already said the same thing ("...a sixty-month ramp-up with the lowest cash point
and payback"). Nothing a reader needs is gone; it has moved one line down. The page title, the
description search engines show and the FAQ are unchanged.

Measured with Playwright on the built pages:

- **At 390 px**, every one of the seventeen is now 3 or 4 lines, down from 5 or 6. Total heading
  height across them fell from 2,929 to 2,020 px (−31%). The tallest, the bookkeeping client fee
  calculator, went from 193 to 129 px.
- **At 1,280 px**, from 145 px (three lines) to 97 px (two) on sixteen of them, −33% in total.

## Keeping it fixed

A test in the site build now fails if any tool page's heading passes 100 characters. It needs no
browser, so it runs on every change. The next step, written up for the next run, is to bring the
limit down to 90 and then 80: 90 headings are still between 81 and 100 characters.

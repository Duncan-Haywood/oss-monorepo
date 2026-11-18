---
title: "The Homepage Hero Stopped Jumping, and Three Speed Fixes That Didn't Work"
seo_title: "Rotating Hero Text Layout Shift: Reserve the Tallest Word"
date: 2026-11-11
tags: [polish, performance, layout-shift, lighthouse]
description: "The homepage's rotating audience line wrapped and moved the page on phones. It now holds its tallest height. Three speed ideas, measured, did not help."
---

The homepage hero has a line that turns through audiences: "Built for **Roofers** and anyone with numbers to run", then HVAC contractors, then Plumbers, and so on. On a 412 px phone "Roofers" fits on one line. "Amazon sellers & KDP authors" needs two. So every few seconds the line wrapped or unwrapped, and the search box, the counts and the backdrop below it moved 20 px up or down. That went on for as long as the page was open.

Lighthouse's default mode simulates a slow phone, and it scored the page's layout shift at 0. Run with real throttling, Lighthouse gave it 0.087 every time. Over one 35-second pass through the words, the summed shift was 0.156.

**The fix.** The line now reserves the height of its longest audience name before the first paint. A hidden copy of the sentence, using that name in bold, shares a grid cell with the real one. A short script then measures every name and pins the exact height. The hero is now the same height through the whole cycle at 320, 412 and 1280 px. The load-time shift is gone, and over a full pass the summed shift fell from 0.156 to 0.050. What's left is the words after the turning name reflowing within the line, which is part of the design. Readers who ask for reduced motion see one name and no reserved space.

One approach made things worse. A small inline script right after the line looked like the earliest place to measure. But an inline script waits for the stylesheets above it, so the browser painted half a hero first, and the shift score jumped to 0.89.

**The three that didn't work.** Our biggest tool page, the [wall framing takeoff](/wall-framing-takeoff/), scores 85 on Lighthouse's mobile test, with a simulated first paint at 3.3 seconds. Earlier notes suggested three fixes. I tested each one against the unchanged page, alternating runs:

- Moving the 38 module preload links out of the page head: first paint 3.3 s either way.
- `content-visibility: auto` on the cards below the fold: layout about 40 ms faster, but no less time blocking input.
- Splitting the first load into two tasks: the longest task fell from 412 to 299 ms, but the total blocking time stayed the same.

Real throttling changes the story. First paint is 1.5 s, but about 900 ms of main-thread blocking follows it. Most of that is the page running the example house's takeoff on load, and half of the takeoff is the optimizer that finds the cheapest mix of board lengths. That is real work, not waste. The fix is engine work, such as moving the optimizer to a background worker, and it's next on the list.

The site's Lighthouse script now reports blocking time and takes the median of several runs, so the next person sees that number first.

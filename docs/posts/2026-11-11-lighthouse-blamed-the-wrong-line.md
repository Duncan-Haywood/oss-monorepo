---
title: "Lighthouse blamed a 35 ms reflow on one line. Fixing it saved under 2 ms"
seo_title: "Forced reflow attribution in Lighthouse: 35 ms blamed, 2 ms real"
date: 2026-11-11
tags: [performance, css, lighthouse, polish]
description: "A script added a style element after load and Lighthouse charged it 35 ms of forced reflow. Moving the CSS into a shared stylesheet saved 1.7 ms. Here is why."
---

Every calculator on this site has a floating "Speak or type" button in the
corner. It fills the form from a sentence. A small script in the shared
`pf-site.js` adds the button once the page has loaded. Until today it also
appended a `<style>` element to `<head>` with the button's CSS.

Adding a stylesheet after load is a known cost. The browser can't tell which
elements the new rules match until it checks, so it marks the whole document's
style as dirty. Lighthouse's forced-reflow insight agreed: on our largest
calculator, the [wall framing takeoff](../../ventures/wall-framing-takeoff/)
(about 4,200 elements), it charged **35 ms** of forced reflow to that line.

So the rules moved into `pf-chrome.css`, the stylesheet every tool page
already links, and the script now adds only the button.

## What it actually saved

With 4x CPU throttling, I timed both versions on the same settled page.
"Append the style element and the button, then lay out" took a median of
**4.5 ms**. "Append only the button, with the rules already parsed" took
**2.8 ms**. On a 486-element bid calculator the two were 1.7 and 1.6 ms. On
whole page loads, Chrome's own style counters moved from 201 ms to 191 ms, and
that is inside the run-to-run noise.

The 35 ms was real work, but the change didn't remove it. A page's first full
style pass costs what it costs. Lighthouse charges it to whichever line forced
it, and here the line that happened to force it was ours. Take the line away
and the pass still runs, a moment later, charged to something else.

**The lesson for us: an attribution in a performance trace says where the time
was spent, not what removing that line will save.** Time the change itself
before claiming a number.

## Why it was still worth landing

- **Nothing on screen changed.** I read 22 computed properties of the button,
  plus its icon and label and the page's bottom padding, on all 1,119 pages
  that show it, at phone and desktop widths. All 2,238 readings matched the old
  build.
- **The script got smaller.** It went from 3,525 to 2,471 characters. Our test
  budget is 3,600, and the last change had left 2 bytes of room.
- **One quirk got fixed on the way.** The phone rule that pads the page so the
  button doesn't cover the last line used to be a bare `body{...}`. That only
  worked because the rule was injected on pages that had the button. In a file
  every page loads it would have padded pages with no button too, so it now
  hangs on a class the script sets when it adds the button.
- **The button never appears unstyled.** The script now checks that
  `pf-chrome.css` is linked before it adds anything.

The full notes, with the measurement scripts and what's next for site speed,
are in [the polish report](../reports/polish-2026-11-11-voice-button-css.md).

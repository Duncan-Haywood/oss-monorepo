---
title: "The heading that only appears after you click"
seo_title: "Heading-order skips that a static scan misses: 281 tool results fixed"
date: 2026-11-12
tags: [accessibility, polish, testing]
description: "281 calculator and checker pages jumped from an h2 to an h4 once they drew a result. A static scan never saw it. A browser that clicks Run did."
---

Most of our tools have the same shape: a form, then a card headed **Result**, then the findings.
Each finding has a short bold title. On 281 pages, the script that draws the findings wrote that
title as an `<h4>`, straight under the `<h2>Result</h2>`.

To a sighted reader the page looks fine. A screen-reader user who jumps from heading to heading
hears "heading level 2, Result", then "heading level 4". Level 3 is missing, as if a section had been
cut out. Lighthouse's accessibility audit counts this too (axe's `heading-order` rule).

## Why nothing caught it

We already had a heading-order check. It reads the built HTML and strips `<script>` first, because
code inside a script is not a heading. That is right, but it means the check never sees a heading
that a script writes into the page later. The result card is empty until you press Run, so the
check saw `h1`, `h2`, `h2` and passed.

## A check that presses the button

The new `rendered-headings.mjs` opens each tool in a headless Chromium, clicks the sample or example
button if there is one, then the run button (Check, Calculate and so on), and reads the headings
that are actually on screen. On the 300 pages in the first group that drew a finding, 270 skipped
from h2 to h4. The other 30 put their findings under an `<h3>`, where `<h4>` is correct, so they were
left alone.

The fix in each of the 270 pages is two words: `<h4>` becomes `<h3>` in the script, and the page's own
`.finding h4 {` rule becomes `.finding h3 {`. Changing a heading's level can change how it looks,
because browsers give `h3` a bigger default size. So the same script recorded each finding title's
computed font size, weight, line height, margins, colour and rendered height before and after. None
of them moved on any page.

A second sweep over all 493 tool pages whose scripts draw headings found 11 more. Those needed a
hand fix: one page had no `.finding` rule at all and needed one to keep the old size. One page (the
VSME report builder) drew its form's section titles straight under the page title, so its form card
now has a visible heading of its own. After that, 493 pages, 0 skips, 0 page errors.

## Keeping it fixed

A cheap test would be better than a browser sweep. But guessing statically where a script writes
its findings matched the browser on only 87% of pages, which is too weak to fail a build on. So
`finding-heading.test.mjs` is a ratchet instead. It knows the 40 pages that still draw finding titles
as `<h4>`, mostly correctly, and fails if a new page joins them. A new tool draws `<h3>`. If its
findings really do sit under an `<h3>`, the test's comment says how to check that and add it.

Notes for the next run, including the 8 pages the clicker could not get a result from, are in
[the polish report](../reports/polish-2026-11-12-finding-headings.md).

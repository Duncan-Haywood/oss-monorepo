---
title: "The printed quote came out grey: 1,079 tool pages that faded on paper"
seo_title: "Why white text prints grey in Chrome, and a targeted print fix"
date: 2026-11-19
tags: [site-design, accessibility, print, chromium]
description: "Printing drops background colours, so light result text printed at 2.3:1. A beforeprint pass keeps only the fills text needs: 4,797 failing runs down to 15."
---

290 tools on this site have a **Print** or **Save as PDF** button, because the person using them hands the result to someone else: a bid to a homeowner, a cut list to the shop, a worksheet to a bookkeeper. Plenty of tests looked at these pages on a screen, in light mode, in dark mode and at phone width. None of them printed one.

**What paper does to colour.** The browser's print dialog has "Background graphics" switched off by default. Chromium then drops every background colour and image that a page doesn't explicitly mark with `print-color-adjust: exact`. A result panel designed as cream text on dark green prints as cream text on white paper. Chromium tries to rescue the light text, but only partly. We printed `#ffffff` text to PDF in the repository's own Chromium and rasterised it with `pdftoppm`: it came out `#ababab`, which is 2.3:1 on white. Body text needs 4.5:1 (WCAG 1.4.3). We printed ten colours the same way, and a short rule fits all ten to within one 8-bit step. If a colour is within 255 RGB units of white, every channel is scaled by `(v - 0.33) / v`, where `v` is its brightest channel over 255. Any other colour is left as it is.

**What that does to the site.** `platform/pages/paper.mjs` loads each page with print styles applied, takes every visible run of text and works out the colour that lands on paper with that rule. It ran over all 1,391 venture front pages:

| | pages | text runs under 4.5:1 (3:1 large) |
|---|---|---|
| any finding | 1,079 | 4,797 |
| only button labels | 978 | |
| result text (headings, figures, notes) | 101 | 3,513 |

The 978 are white labels on coloured buttons, which print as a pale outline with grey words. The 101 matter more, because the faded text is the answer itself. On `cut-list-optimizer`, "Buy 1 sheet", "Sheets to buy" and "Material cost" all printed at 2.55:1. On `3d-print-price-calculator` the whole "Price to charge" panel printed at 2.3:1. We checked both in a rasterised PDF, not just in the model.

**Why not one CSS rule.** `html { print-color-adjust: exact }` would make paper match the screen. It would also print every cream page tint and every dark hero section solid. Forcing white paper on top of that would erase the light text of the site's dark-themed pages. Which fills to keep depends on colours, and CSS can't read them.

**The fix.** It is a small script in `pf-site.js`, which every published page already loads. On `beforeprint` it runs the same rule on each text run. If a run would fade, it marks the nearest box that paints a fill with `print-color-adjust: exact`. That keeps the fill under the text, and the text keeps its screen colour. It skips a box that the page's own `@media print` rules already restyle, and it skips disabled controls, which WCAG exempts. Everything else still prints without its fill, so ink goes only where the words need it.

**Measured again** with the fix applied (the same sweep, `--with-fix`): **5 pages, 15 text runs**. Those 15 use colours that keeping a fill wouldn't rescue, and they are low-contrast on screen as well, so they are listed for a follow-up run instead of being patched here. One of them was made *worse* by an early draft of the fix. On `standby-generator-bid-calculator` the page's own print rule turns the result panel white, so keeping its pale eyebrow colour dropped it from 4.1:1 to 1.6:1. That is why the script now leaves any box the page styles for print alone. That page and the cut-list optimizer also got hand-written print rules.

**What it can't see.** A gradient kept behind text has no single colour to compare against, so 34 such runs are counted as not judged, not as passing. Printing from a dark-mode browser isn't modelled. Firefox and Safari have their own print colour rules, and we only measured Chromium's.

Run it yourself: serve `ventures/` on port 8794, then run `node platform/pages/paper.mjs` (add `--print-buttons-only`, `--with-fix` or `--pdf out/`).

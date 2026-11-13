# Polish 2026-11-13: clothing-design-studio's header stops being the link hub

Follows `polish-2026-11-13-intro-walls.md`, whose "still weakest" list put the
clothing-design-studio intro first (a flagship, 40 links in one paragraph).

## What was wrong

- The header held **two near-identical `lede` paragraphs**, one after the other: the same
  sentence, then 40 and 37 tool links. They had drifted (one had pattern, colour and
  financing; the other had ad spend). A hand-kept copy of the tool list, kept twice.
- Even so it linked only **40 of the 50 tools** on the launch path. Not linked from the
  studio page at all: worked example on hoodie duty, duty on a single parcel, discount,
  bundle pricing, sunglasses margin example, 300-piece MOQ example, US sales tax, EU VAT,
  French textile eco-contribution, green-claims checker.
- On a 390 px phone the command box (the first input) sat at **1,613 px**; header 1,558 px.
- **The page scrolled sideways at 390 px** (scrollWidth 479), for three separate reasons:
  the workspace grid's phone rule was `1fr` (it cannot shrink below its widest child);
  `input[type=email]` and `input[type=url]` in the storefront form were missing from the
  full-width input rule; the launch-calendar table in `#mkt-out` is 372 px in a 324 px panel.

## What changed

1. Header: one lede paragraph and a jump row (`<nav class="jump">`) of five: Start
   designing (filled), Launch path, What does a t-shirt cost to make?, Who it is for, Every tool.
2. A new `#tools` section above the FAQ, "Every tool, in launch order (50)", grouped by the
   six stages. It is **generated** from `journey.mjs` (`studioToolsHtml()`, filled by
   `node buildhub.mjs` between `<!-- tools -->` markers), the same list that drives
   launch.html and every page's journey footer, so a new tool shows up here without anyone
   remembering to add it. `journey.test.mjs` fails if the section is stale.
3. Sideways scroll: `.workspace` phone rule `minmax(0, 1fr)`; email and url inputs join the
   width rule; tool outputs (`.workspace output`, `#ix-cal-out`, `#sep-out`) scroll inside
   their own box.
4. `platform/pages/intro-links.test.mjs`: `clothing-design-studio` removed from `KNOWN`.

## Numbers (local server, Chromium, first input's document y / header height)

| width | before | after |
|---|---|---|
| 390 | 1,613 / 1,558, scrolls sideways (479) | **527 / 472**, no sideways scroll |
| 320 | not measured | 552 / 497, no sideways scroll |
| 1,280 | 881 / 826 | **320 / 265** |

Header links 77 to 5. Contrast: jump chips `#2a2320` on `#fffdf9` and white on `#6b1e2c`
are both well over 7:1; stage headings `#6b1e2c` on `#fffdf9` likewise. Chips are 32 px tall.
No new request, no script. Venture suite: see the run record.

Screenshots (390 px, 2x): [before](img/polish-2026-11-13-studio-header-390-before.png) ·
[after](img/polish-2026-11-13-studio-header-390-after.png) ·
[1,280 after](img/polish-2026-11-13-studio-header-1280-after.png) ·
[Every tool section](img/polish-2026-11-13-studio-header-tools-1280.png).

## Still weakest, and what I would do next

1. **ai-bookkeeper (33 links in one header paragraph)**, the other flagship in
   `intro-links.test.mjs` KNOWN. Same treatment; if its pages have a list like `journey.mjs`,
   generate from it.
2. The scrolling output boxes are not keyboard-focusable (no `tabindex`); at desktop widths
   nothing overflows, so it matters only on a phone with a keyboard. A shared fix would add a
   focusable wrapper around generated tables.
3. A shared `.jump` component: now four pages carry their own copy of the CSS (Etsy, eBay,
   Reverb, clothing-design-studio). Time to put it in the venture chrome.
4. Carried over: appointment-deposit-calculator (1,613) and quarterly-estimated-tax-calendar
   (1,460) first-input depths; topic-page titles four lines on phones.

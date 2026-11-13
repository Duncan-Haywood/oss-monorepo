# Polish 2026-11-13: ai-bookkeeper's 33-link header note and 15-link footer line, now one Guides section

**Why.** Item 1 of "Still weakest" in `polish-2026-11-13-studio-header.md`: "ai-bookkeeper (33 links
in one header paragraph), the other flagship in `intro-links.test.mjs` KNOWN." Looking at it, the
header held 33 of the 48 guide pages; the other 15 (pest, drone, tattoo, trucking, landlords, ...)
were only in a hand-kept footer `<p class="more-pages">Also: ...</p>`. Nothing generates either list.

## What changed

1. `ventures/ai-bookkeeper/index.html` header: the `.note` keeps the AI, independence and
   not-advice sentences; a `<nav class="jump" aria-label="Guides">` of four pills follows (how-to,
   vs QuickBooks/Xero/Wave, `#guides`, tax calendar).
2. New `<section class="card" id="guides">` before the FAQ: "Start here" (6), "Selling online"
   (9, three CSS columns at desktop), "By kind of business" (35, sorted by label, `columns: 15rem`).
   Labels are short ("Pest control", "Landlords (Schedule E by property)"), not the 60-character
   page titles the footer line repeated.
3. The footer "Also:" line is deleted (every link in it is in `#guides`).
4. `ventures/ai-bookkeeper/page.test.mjs`: every `*.html` in the folder is linked from `#guides`,
   `#guides` links no missing page, and the header has at most 8 links.
5. `platform/pages/intro-links.test.mjs`: `ai-bookkeeper` removed from `KNOWN`.

`llms.txt` already listed all 48 guides; unchanged.

## Numbers

Source page served with `python3 -m http.server`, pre-installed Chromium, third-party requests
blocked, reduced motion, 400 ms after `load`. "First control" is the document y of the first
visible input/select/textarea/button outside `header` and `nav` (the Import box). Before = `HEAD`'s
`index.html` served from the same folder.

| | 390 before | 390 after | 1,280 before | 1,280 after |
|---|---|---|---|---|
| first control | 1,160 | **904** | 595 | **515** |
| header height | 1,027 | **771** | 444 | **364** |
| page height | 27,646 | 28,831 | 16,887 | 17,474 |
| `#guides` height | | 1,821 | | 791 |
| sideways scroll | no | no | no | no |

Screenshots: [390 before](img/polish-2026-11-13-bookkeeper-header-390-before.png) ·
[390 after](img/polish-2026-11-13-bookkeeper-header-390-after.png) ·
[1280 before](img/polish-2026-11-13-bookkeeper-header-1280-before.png) ·
[1280 after](img/polish-2026-11-13-bookkeeper-header-1280-after.png) ·
[guides 1280](img/polish-2026-11-13-bookkeeper-guides-1280.png) ·
[guides 390](img/polish-2026-11-13-bookkeeper-guides-390.png).

## Still weakest, and what I would do next

1. **The ai-bookkeeper lede is ~250 px on a phone** and the Import box is still 904 px down (one
   844 px screen is the target). Cutting the bold-studded paragraph to two sentences would put it
   inside the first screen; that is copy work on a flagship, worth doing with care.
2. **`#guides` is 1,821 px at 390 px** because 15rem columns collapse to one. Two columns of the
   short labels would fit at 390 (each label is under ~20 characters except a handful); measure
   before changing.
3. **The other KNOWN pages in `intro-links.test.mjs`**: league-schedule-generator (28),
   shift-roster-builder (21), state-residency-day-counter (10), 3pl-quote-normalizer (10). Same
   treatment.
4. Carried over: shared `.jump` component (now five copies: Etsy, eBay, Reverb,
   clothing-design-studio, ai-bookkeeper); topic-page titles four lines on phones (looked at this run:
   research titles are questions, median 91 characters, max 201, over 794 cards; a short-title field
   is editorial work, a smaller font saves under a line); `.pager` defined twice in the writing STYLE.

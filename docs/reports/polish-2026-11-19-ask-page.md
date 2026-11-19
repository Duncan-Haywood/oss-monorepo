---
kind: polish
topics: [design, accessibility]
date: 2026-11-19
---
# Polish, 2026-11-19: /ask/ tables stack as cards on phones; example questions in the empty panel

Track: polish/0. PR #17474. Not from `polish_queue.py`. The 2026-11-18 queue was 34 items, most
of them about audience pages at 320 to 360 px. Following the prompt ("the weakest surface a
visitor is most likely to see"), I screenshotted the hub, wall-framing-takeoff, /research/,
/stories/, /writing/, a post, and the four most-loaded pages in
`portfolio/usage/site-visits.json` (`/c/`, `/ask/`, `/shed-designer/`, `/about/`). /ask/ at 390 px was
clearly the weakest.

Side note for the next run: the hub's stat tiles count up from 0, so a screenshot taken 300 ms
after load shows wrong numbers (e.g. "Research projects 635" beside "1,080 research projects").
That is the animation, not a bug. Wait about 2 s.

## What changed

- `platform/pages/assistant.mjs`: both tables get `class="stack"`, ARIA table roles and a
  `data-label` on every cell. Under `max-width:600px` each row becomes a bordered card: the first
  cell is the card's title, the others are a two-column grid with the label on the left, and
  `thead` is visually hidden. `.tablewrap` gets `margin:14px 0 18px`. New `ASK_SUGGESTIONS`
  (three questions) passed to `mount()`.
- `platform/pages/assistant/client.js`: `mount(container, { suggestions })` → `build()` puts a
  `.pa-try` row of buttons (`role=group`) under the greeting, only on pages with no form fields.
  A tap submits that question. Any submit removes the row. The floating panel on other pages is
  unchanged (it passes no suggestions).
- `platform/pages/assistant.test.mjs`: the score test now expects the labelled cells. A new test
  checks that every row's labels match its table's headers in order, the phone CSS, and that the
  page passes `ASK_SUGGESTIONS` to `mount()`.

## Measured (Chromium over the built site; "before" is the same build with this diff's HTML and CSS removed)

| | before | after |
|---|---|---|
| 390: narrowest table cell | 54 px | 328 px |
| 390: tables overflowing their scroller | 2 | 0 |
| 390: gap from table to next paragraph | 0 | 18 px |
| 390: blank space under the greeting | 183 px | 53 px |
| 390: page height | 10,253 | 10,172 |
| 320: page height | 11,801 | 11,954 |
| 1280: page height / blank in panel | 6,237 / 266 | 6,273 / 220 |
| scrollWidth = viewport (320, 390, 1280) | yes | yes |

Each example question was clicked on the built page with the default (rules) engine:
"Which tool prices a roofing job?" → trade bid hub + roofing audience page. "What does eBay
charge to sell a $40 item?" → Where to Sell calculator, marketplace fee tools. "Does what I type
leave my device?" → quotes the page's FAQ answer. The first candidate, "eBay fees on a $40 sale",
matched the blind-round table row in `bestPassage` and led with it, so it was replaced. Light and
dark both checked at 390.

Screenshots: `img/polish-2026-11-19-ask-page-{before,after}-{panel,table}-390.jpg`.

## Still weakest, and what I would do next

1. **Other wide tables on prose pages.** /ask/'s problem (four or more text-heavy columns in an
   `overflow-x` wrapper) is likely elsewhere: the guides, comparisons and About. The `.stack`
   pattern could move into the shared stylesheet (`pf-site.css`) as an opt-in class, with a
   static check that a `.stack` table labels every cell.
2. **The example questions are checked by hand.** A browser check that clicks each one on the
   built page and fails on "I found nothing" would keep them true when tools are renamed
   (`fold-check.mjs` is the pattern).
3. **/about/ (4th most loaded) is 19,771 px at 390.** I didn't look past its first screen.

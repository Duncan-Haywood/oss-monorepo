---
kind: polish
date: 2026-11-16
---
# Polish 2026-11-16: Stories page cards lead with the hook

Track: polish/0. I screenshotted the hub, wall-framing-takeoff, ai-bookkeeper, research, stories, the
blog and a story post at 390 and 1,280 px, then picked the weakest surface a visitor sees. That
was the Stories page cards: on a phone the setting line took three to five lines and the hook was
cut after it. This isn't from a previous "Still weakest" list. Those lists were down to
single-page nits (related-tool weighting, the "Need this tool" wording on ShootFlow docs). Open PRs
checked: none touch `stories.mjs`.

False alarm worth knowing: the hub's stat tile read "Research projects 719" in a screenshot taken
400 ms after load, but the HTML says 1,080. That's the count-up animation caught mid-flight, not a
mismatch with the search label. Wait at least 1.5 s before screenshotting the hub.

## What changed (`platform/pages/stories.mjs`)

- The card order is now title, summary (ink colour, 4-line clamp), setting (`.where`, one line with
  an ellipsis, full text in `title`), then `.when` (long date, plus an audio badge only when there
  is audio). The " · text" suffix is gone.
- The card is a flex column with `margin-top:auto` on `.where`, so setting and date sit at the foot
  and line up across a grid row.
- The title link's `::after` covers the card. The focus ring moves to the `li` via `:has()`, inside
  `@supports selector(:has(*))`, so browsers without `:has` keep the link's own outline.
- The border colour transitions on hover and focus, and the transition is off under
  `prefers-reduced-motion`.
- The shelf's `.meta` line has no 68ch cap, so "Podcast RSS feed" no longer wraps a lone "feed".
- New `longDate()` export, and 2 tests in `stories.test.mjs` (card order and markup; the date
  format).

## Measured (Playwright, built page)

| | before | after |
|---|---|---|
| Hearth card heights, 390 px | 184–227 (uneven) | 196 ×6 |
| Hearth card heights, 1,280 px | 231 | 218 |
| setting lines per card, 390 px | 3–5 | 1 |
| hook lines shown | 3 (after the setting, muted) | up to 4 (under the title) |
| scrollWidth 390 / 1,280 | 390 / 1,280 | 390 / 1,280 |

Screenshots: `img/polish-2026-11-16-story-cards-{before,after}-{m,d}.png`.

## Still weakest, and what I would do next

1. **None of the six newest cards on any shelf has audio**, so the audio badge only shows in the
   unit test. Hearth has 18 recordings and they're older stories. A "Listen" row of the newest
   recorded pieces per shelf would surface the audio the page promises in its lede.
2. **The Stories hero and shelves use a 960 px column centred inside a 1,120 px header**, so the
   page's left edge (176 px at 1,280) doesn't line up with the brand (96 px). The research index
   has the same offset. Decide on one column rule for section index pages.
3. **The hub's right half at 1,280 px is empty starfield** beside a left-aligned hero. A real
   screenshot of a flagship tool there (showcase stills exist) would show the product instead of
   decoration.
4. Carried over: `relatedTools` on Vendor Watch picks by category; "Need this tool to do more?" on
   ShootFlow's docs pages.

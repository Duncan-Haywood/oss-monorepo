---
kind: polish
topics: [design, privacy, guardrails]
date: 2026-11-14
---
# Polish 2026-11-14: the shared footer's Privacy paragraph, 499 words → 115, and accurate again

Track: polish/0. Picked from `polish-2026-11-14-request-fold.md`, "Still weakest" item 1 ("the
shared footer is ~3,400 px on a phone"). Searched open PRs: none touch `disclaimerHtml`. PR #13005
(an old, open "move the footer link grid into a header Menu") touches the link grid only; its
idea is untouched here.

## What was wrong

Measured in Chromium on the built `dist/` (390 × 844, reduced motion), the footer from
`disclaimerHtml` (hub, every category page, About, custom development, …) was 3,341 to 3,391 px.
Of that, **one paragraph, Privacy, was 1,742 px**: it named every `externalCallExceptions` tool
inline (54 names, some of them full question-shaped titles) and then every host they call (about 40,
including scanner artefacts like `x` and `proxy.local`). Then it said all 54 "check a live public
API as their whole job". That was true of the first exception, Sponsor Ready. It is not true of
AI Bookkeeper (an AI model), the Stripe and CRM tools (an account you connect), or the tools that
talk to a local model on `localhost`.

The same "public API it checks" wording was on the About lede, the About boilerplate for
linkers (which also inlined every name and host), the category count lines and `llms.txt`.

## What changed

- `build.mjs`: one shared description, `EXCEPTION_NOUN` ("tools that call an outside service") and
  `EXCEPTION_KINDS` ("a public lookup, an AI model or business account you connect, or a server you
  run yourself"), used by the footer, `privacyClaimParts` (category pages), the About page and
  `llms.txt`. The footer sentence now counts the tools; the names and hosts sit in a
  `<details class="pfs-exceptions">` after the paragraph, so the whole list is still on every page.
  The About boilerplate counts instead of listing; About's own panel still links every tool.
- `CARD_FOOTER_EXCEPTION` (share cards): "one lookup checks a public API" → "may call an outside
  service".
- `site-nav.mjs`: the footer link grid is two columns at ≤560 px (was one column of 24 links, 652 px);
  the credit line ("A Maris Stella Labs project, MIT licensed.") no longer sits in a 200 px grid
  cell, so it stays one line.
- `build.test.mjs`: a new test checks that the footer's Privacy paragraph on the hub and About stays
  under 260 words, still counts the exceptions, doesn't say "whole job", and that the fold names
  every exception tool and host. The category test follows the new noun.

## Measured (footer height, px)

| Page | 390 before | 390 after | 1,280 before | 1,280 after |
|---|---|---|---|---|
| `/` | 3,391 | 2,196 | 1,758 | 1,278 |
| `/custom-development/` | 3,341 | 2,099 | 1,661 | 1,157 |
| `/c/trades/`, `/about/` (same footer) | 3,341 | ~2,100 | 1,661 | ~1,160 |

Privacy paragraph alone: 1,742 → 648 px at 390, 781 → 290 at 1,280. About page total height at
390: 23,248 → 19,696 (the lede's fold also stopped repeating the host list). No sideways scroll at
1,280 with the fold open.

Screenshots: `img/polish-2026-11-14-footer-fold-390-before.png`, `-after.png`.

## Still weakest, and what I would do next

1. **The page-view counter sentence is 110 words** and is now most of the Privacy paragraph
   (~450 px at 390). It's a disclosure, so it should stay visible, but it could be a short list
   ("We count: which page, which day, …; we never store: …") that reads in half the height.
2. **`surfaceExternalFetchHosts` reports artefacts** (`x`, `proxy.local`, `www.w3.org`). They are
   harmless over-disclosure but look careless in the host list; a per-venture allow-list of "named
   in source, never requested" hosts would clean it.
3. **About's "What happens to what you type" panel** still inlines all 54 linked names twice (the
   transmitted bullet and the third-party bullet). A table (tool, what it sends, where) would be
   the honest, scannable version.
4. Carried over: `contrast.mjs` fallback without axe-core; answer leads on ~22 tools; lead cap
   100 → 90.

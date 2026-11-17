---
kind: polish
date: 2026-11-15
---
# Polish 2026-11-15: the embed offer needs a control to embed

Track: polish/0. Picked from `polish-2026-11-15-false-noscript-and-raw-page.md`, "Still weakest"
item 2 (the embed offer appears on pages that are not tools). Searched open PRs for `polish` and
`embed`: none touched it.

## What changed

- `platform/pages/embed.mjs`: new `hasOwnControls(html)` (an input, select, button, textarea or
  canvas outside script/style bodies and outside `SITE_OWNED_CONTROLS_RE`). `injectEmbedWidget`
  returns the page unchanged when it is false. `SITE_OWNED_CONTROLS_RE` moved here from
  `build.mjs` and is imported back, so the noscript notice and the embed gate share one list.
- `platform/pages/build.mjs`: the shop-rates counter compared `withRates` to `withCard` (before
  the embed pass), so it counted every embedded page. Now compares to `withEmbed`.
- `embed.test.mjs`: the stand-in page has a real input; new tests for a brochure page and for
  `hasOwnControls` (search form, JSON-LD quoting `<button>`, canvas, select).

## Measured (full build before and after)

| | before | after |
|---|---|---|
| "Added an embed offer to N tool entry page(s)" | 1,368 | 1,361 |
| offer pages with no own control | 7 | 0 |
| "Carried saved shop rates into N ..." | 1,369 | 125 |
| `check.mjs` | — | 10,284 pages, no dead links |
| `node --test 'platform/pages/*.test.mjs'` | — | 1,679 pass, 0 fail |

The seven: `ai-engineering-academy`, `garmin-world-traveler-watchface`, `photo-editing`,
`photos-import-tools`, `quick-pick-survey`, `self-hosted-saas-stack`, `vendor-watch`.
Screenshots of the footer at 390 px: `img/polish-embed-gate-{photo-editing,self-hosted-saas-stack}-{before,after}-390.png`.

## Still weakest, and what I would do next

1. **The footer chrome's lead line is also wrong on those seven pages**: "Free and private, like
   this one — everything runs in your browser, and nothing you type is uploaded" sits under
   ShootFlow (a desktop app) and Vendor Watch (a server). `hasOwnControls` could pick a
   neutral lead ("More free tools from the same catalogue") where it is false; the chrome is
   written in `injectChrome` (`build.mjs`) before the embed pass, so pass the flag in.
2. Carried over: ShootFlow's index "What exists today" list is one long bullet (coordinate with
   the deepen PR); `.pager` defined twice in the writing STYLE; research index card ledes;
   topic-page titles four lines on phones.

---
kind: polish
topics: [design, money]
date: 2026-11-26
---
# Polish 2026-11-26: base type, phone cards and a real still on the e-invoicing front door

## What I picked and why

Routed to polish (draw). The security queue and the ideas inbox were empty.
I took item 1 of "Still weakest" in `polish-2026-11-25-construction-page-stills.md`
(other industry pages are text-only). `industries/manufacturing/` had already
got its stills, so I took `industries/eu-e-invoicing/` (bet #3). Screenshots at
1280 and 390 px turned up a bigger defect than the missing image: **the page set
no body font**. It rendered in Times New Roman at the window's full width
(1,264 px lines at 1280). `industries/manufacturing/` (bets #2 and #4) was also
in Times, though it already had a max-width. pf-site.css draws the header, the
hero and the footer, but no body type. Construction, nonprofits and
online-sellers each carry their own base type; these two did not.

## What changed

- `industry-e-invoicing.mjs`: base `body` font, colour and background (dark
  mode too), `.wrap` max-width 52rem with `--pf-hero-pull`, `h2` spacing.
  The deadline table is `class="stack"` and goes through `labelStackTables`, so
  each row becomes a labelled card on a phone. The FAQ `<dl>` is styled (bold
  `dt`, ruled `dd`). A new `shots` option puts the checker's still in
  "The free checker" section (lazy, 600/1200 srcset, alt text that names the tool).
- `industry-manufacturing.mjs`: base `body` font, colour and background (dark
  mode too), and link colour.
- `showcase/capture.mjs`: new SHOTS entry `einvoice-preflight` (clicks
  `#sample`, `#check`; hero crop from `#results`, so the crop shows the two
  findings and their fixes. A crop from `#overall` showed only the counters and
  buttons). Captured with `--stills-only --only=einvoice-preflight`: 30 KB,
  8 KB and 19 KB WebP files.
- `build.mjs`: passes `showcase.shots` to the e-invoicing page.
- Tests: `industry-base-type.test.mjs` (every industry page with a renderer
  sets a sans-serif body font, a colour, a background, a dark background and a
  max-width). It fails on main for e-invoicing and manufacturing (3 of 8
  tests) and passes now. `industry-e-invoicing.test.mjs` adds tests for the
  still and the stacked cards.
- Post: an update section on
  `docs/posts/2026-11-24-e-invoicing-deadlines-four-countries-official-sources.md`
  (consolidated, not a new post).

## Measured (local build, Playwright Chromium)

| | before | after |
|---|---|---|
| e-invoicing body font | Times New Roman | system-ui |
| e-invoicing paragraph width at 1280 | 1,264 px | 832 px |
| e-invoicing "What changes" column at 390 | ~100 px, scroll box | full-width card |
| e-invoicing phone height (390) | 8,812 px | 12,405 px |
| e-invoicing desktop height (1280) | 3,867 px | 6,834 px |
| Images on e-invoicing page | 0 | 1 |
| Sideways scroll at 390 | none | none (scrollWidth 390) |
| manufacturing body font | Times New Roman | system-ui |
| Dark mode body | browser white | #12171d with light ink |

The pages are taller because lines at a readable measure take more of them.
`check.mjs`: publishable, no dead links. No traffic claim: usage is unmeasured.

## Still weakest, next

1. **online-sellers** builds through a `shell` and was left out of the new
   base-type test (it renders system-ui today). Adding it needs a stub shell.
2. **Hero CTA contrast on e-invoicing**: `.ei-alt` is a 1 px outline on the dark
   band. Fine, but the construction page's button pair looks more finished.
   A shared industry-page CTA component would serve all five.
3. The five industry pages each carry their own base CSS: construction (`ic-`),
   nonprofits (`ind-`), manufacturing (`mfg`), e-invoicing (`ei-`) and
   online-sellers. One shared industry stylesheet in site-nav.mjs would stop
   this class of gap from recurring. It is the bigger refactor.
4. Carried: og:title on einvoice country guides; mid-title ellipses in
   `writing/` and `research/`; 28 px band buttons on phones.

# Polish 2026-11-13: one shared jump row and guide list

**Why.** Item 1 of "Still weakest" in `polish-2026-11-13-last-intro-walls.md` (also raised in
`polish-2026-11-13-studio-header.md` and `polish-2026-11-13-bookkeeper-guides.md`): ten tool pages
carried their own copy of the jump-row CSS, so a new page could only adopt the pattern by copying it
again. No open PR touched it (searched `polish in:title`, `jump in:title`).

## What was wrong

The copies had already drifted. Pill padding was 11 px on three pages and 12 px on six. Type was
.86rem on five and .87rem on four. The focus ring was 2 px on four and 3 px on five, and there were
five different top margins. `.guide-list` had two item spacings (4 px and 6 px).

## What changed

1. `platform/pages/jump-row.mjs` (new) exports `JUMP_ROW_CSS`. `renderChromeStyle()` appends it to
   `pf-chrome.css`, which every tool page already links, so this adds no request. Classes:
   `pf-jump` (the row), `pf-jump-main` (optional filled pill), `pf-guide-list`, and `pf-cols` for
   columns of 15rem. Colours come from `--jump-fg`, `--jump-bg`, `--jump-line`, `--jump-hover`,
   `--jump-on` and `--jump-margin`. Each has a fallback, and the defaults follow the text colour, so
   a page that sets nothing still gets a readable row.
2. Nine pages migrated. Each page's CSS block is now one line of custom properties in its own
   colours: 3pl-quote-normalizer, ai-bookkeeper, clothing-design-studio (its first pill is now
   `pf-jump-main`, not `:first-child`), etsy, reverb, league-schedule-generator,
   shift-roster-builder, state-residency-day-counter, and ebay. eBay keeps its `<details>`
   disclosure, and the nav inside it uses `pf-jump`.
3. Left alone: shed-designer's `.jump`, which is a different component (a sticky section bar, not
   pills). Also left alone are etsy and reverb's `.guides` list (`columns: 2 300px`, a different
   layout) and the site's own `.jump` rows in `build.mjs`, `stories.mjs`, `updates.mjs` and
   `queue.mjs`, which are site pages with their own stylesheet. The new class names do not collide
   with any of them.
4. `platform/pages/jump-row.test.mjs` checks that:
   - the CSS is in the chrome stylesheet;
   - the main pill never falls back to `currentColor`, which would put white text on a white pill.
     The first draft had this bug, and the test was written to catch it;
   - pills keep a 34 px target and a 3 px focus ring;
   - no tool page carries its own `.jump a {… 999px}` or `.guide-list` rule;
   - `pf-jump-main` appears only inside a row.
5. `intro-links.test.mjs` failure hint now names `pf-jump` / `pf-guide-list`.

**Specificity.** `pf-chrome.css` is linked after the page's `<style>`, so the shared rules win ties.
They use one class (`.pf-jump a` is 0,1,1), so a page's `header a` or `nav` rules never restyle a
pill. A page that needs a structural change writes a more specific rule (eBay's
`.jump .pf-jump { padding }`).

## Measured

Full local build of main, served from `dist/`. Pre-installed Chromium, third-party requests
blocked, reduced motion, 300 ms after `load`. "After" is the same `dist/` with the identical edits
spliced into the nine built pages and a regenerated `pf-chrome.css`.

| nine pages, 390 and 1,280 px | before | after |
|---|---|---|
| pill padding / type / height | 11 or 12 px, .86 or .87rem, 34 px | 12 px, .87rem, 34 px everywhere |
| focus ring | 2 or 3 px | 3 px |
| jump-row height | unchanged on 17 of 18 page-widths | eBay at 390: 922 → 962 (the row sits inside a closed `<details>`, so no visitor sees it until it is opened: one more wrapped line of 24 pills) |
| `#guides` height | | 3pl −18 px, state-residency −18 px (item gap 6 → 4 px), others unchanged |
| sideways scroll | 0 | 0 |
| CSS copies of the pill rule in `ventures/` | 10 | 0 (shed-designer's bar is not a pill) |

A first draft used `box-sizing: border-box` with `min-height: 32px`, which shrank every pill from
34 to 32 px. The shipped rule is `min-height: 34px` with border-box, so the tap target stays the
same on pages with and without a global `box-sizing` reset.

Screenshots: [clothing-design-studio 390 before](img/polish-2026-11-13-jump-row-clothing-design-studio-390-before.png) ·
[after](img/polish-2026-11-13-jump-row-clothing-design-studio-390-after.png) ·
[ai-bookkeeper 390 before](img/polish-2026-11-13-jump-row-ai-bookkeeper-390-before.png) ·
[after](img/polish-2026-11-13-jump-row-ai-bookkeeper-390-after.png) ·
[etsy 1280 before](img/polish-2026-11-13-jump-row-etsy-profit-calculator-1280-before.png) ·
[after](img/polish-2026-11-13-jump-row-etsy-profit-calculator-1280-after.png). They are meant to
look the same. This change is about consistency and reuse, not a new look.

### Tried and rejected: two columns of guides on a phone

Carried-over item: ai-bookkeeper's `#guides` is 1,821 px at 390 px, because `columns: 15rem`
collapses to one column. I measured
`@media (max-width:600px){.pf-guide-list.pf-cols{columns:2;column-gap:24px}}` on the three pages
that use `pf-cols`:

| `#guides` height | 320 px before → after | 390 px before → after |
|---|---|---|
| ai-bookkeeper | 2,137 → 1,890 | 1,821 → 1,494 |
| league-schedule-generator | 1,711 → 1,799 | 1,317 → 1,355 |
| shift-roster-builder | 1,402 → 1,415 | 1,058 → 1,120 |

Columns would be 100 to 141 px wide, so 18 of 44 ai-bookkeeper labels wrap at 390, and every league
label wraps at 320. Only the page with very short labels gains, so this does not belong in the
shared rule. If anyone does it, it belongs on ai-bookkeeper alone (for example a `pf-cols-2`
modifier set on that page only), with its labels checked at 320.

## Checks run

- `node --test platform/pages/jump-row.test.mjs platform/pages/intro-links.test.mjs`: 8 pass.
- The 58 page, SEO, guide and link test files of the nine ventures: 1,594 pass, 0 fail.
- Full rebuild, then `node platform/pages/check.mjs`: "looks publishable: 1349 products, 45
  category pages, 9200 pages, no dead links."
- `node --test 'platform/pages/*.test.mjs'`: 1,617 tests, 1 fail, the rest passed or skipped. The
  failure was "chrome takes its theme from the host page" in `build.test.mjs`: the chrome
  stylesheet may not hard-code a colour, and my neutral border fallback was `#c9d0d8`. It is now
  `rgba(128,128,128,.45)`, the chrome's own neutral line. The filled main pill's fill-and-ink pair
  is allowed the same way the voice button's is. After that fix, `build.test.mjs` +
  `jump-row.test.mjs`: 317 pass, 0 fail.

## Still weakest, and what I would do next

1. **Adopt the row where intros still run long.** appointment-deposit-calculator (first input at
   1,613 px on a phone) and quarterly-estimated-tax-calendar (1,460 px) are long for reasons other
   than links. Read them one by one. A jump row now costs a page only markup.
2. **Lower `MAX_LINKS`** in `intro-links.test.mjs` from 8 to 6. Count the pages at 7 or 8 first.
3. **Etsy and reverb `.guides`** could move to `pf-guide-list` with a `pf-cols-2` variant
   (`columns: 2 300px`) if a third page wants that layout.
4. Carried over: answer leads missing on about 30 high-intent tools
   (economic-nexus-threshold-tracker first); the ticker's third line at 320 px; `.pager` defined
   twice in the writing STYLE; scrolling output tables not keyboard-focusable on clothing-design-studio.

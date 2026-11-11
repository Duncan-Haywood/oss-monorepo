---
kind: polish
topics: [design, accessibility]
date: 2026-11-11
---
# Polish 2026-11-11: 98 tool pages shipped in browser defaults; all styled, plus a check

## What I measured

- **Browser sweep, all 1,344 tool index pages in the build** (Chromium, JS off; computed `font-family`
  of the first label or paragraph in `<main>`). Before: **98 "Times New Roman"**, 1,246 styled.
  After: **0**, 1,344 styled. The sweep script is in this report's "How to rerun" section.
- **Static check vs browser:** `bare-tool.mjs`'s `isBare()` (no stylesheet link, and no valid
  `:root`/`html`/`body` rule that sets a font) lists exactly the same 98 index pages as the browser.
  A first, cruder check ("no `font:` anywhere") found 91 and missed seven. Six had a font rule only on
  `textarea`. One (medical-bill-error-checker) had a doubled `<style>` tag that made the parser drop its
  `:root` rule. The static check also flags three non-index pages (two caa-record-check guides and one
  service-load-check guide), which are now fixed too.
- **Rendered heading order** on the 95 pages whose findings were `<h4>` under `<h2>Result</h2>`.
  The script clicks the run button, drops `[hidden]` nodes and runs `headingSkips`. Before: 93 of the
  93 pages that drew findings had an h2 to h4 skip. After: 0. No page errors either way.
- `ink.mjs` (link contrast, 3,629 pages): no violations. The 101 changed ventures' own test suites:
  2,664 tests, one failure, fixed (see below).

Before/after: `img/polish-2026-11-11-bare-tools-before.png`, `img/polish-2026-11-11-bare-tools-after.png`.

## What shipped

1. `platform/pages/bare-tool.mjs`: `isBare`, `addBaseStyle` (inserts a `<style data-base-style>`
   before the page's first `<style>`), and a CLI (`--fix`). Every rule is `:where()`, so the page's own
   rules always win. The accent is the favicon fill, darkened to 4.5:1 against white and the page
   background.
2. 100 pages given the base block, and medical-bill-error-checker's doubled `<style>` tag removed.
3. 95 pages: `<h4>` to `<h3>` in the result renderers. Only on pages where every `<h4>` was a
   `.finding` heading, the page CSS never mentioned h4, and no `<h3>` was drawn by script.
4. `surety-bond-capacity-calculator/page.test.mjs` read every `<h3>` in the file, including the ones
   in the module script, as FAQ questions. It now strips `<script>` first. The test's intent
   (visible FAQ equals JSON-LD) is unchanged.
5. allergen-label-maker: the per-dish list printed "undefined: Flour tortilla (check)" on the UK/EU
   list, because the engine's `wheat` key (kept for the US list) has no EU14 label. `why()` now keeps
   only keys in the selected list. Checked in the browser on both lists: 0 "undefined".
6. `bare-tool.test.mjs`: unit tests, plus a repo test that no page under `ventures/` is bare.

## Still weakest, and what I would do next

1. **The generator that made these pages is not in the repo** (no template matches
   `aria-labelledby="h-0"`), so the test is the only guard. If a new batch lands bare, the test goes red
   and `--fix` repairs it.
2. **Other h2 to h4 result renderers.** The heading-order report counted about 123 venture
   directories. This run fixed 95. The rest style `.finding h4` themselves (about 290 pages with their
   own inline CSS). There the swap needs `.finding h4` changed to `.finding h3` in the same page, and a
   computed-style before/after to show nothing moved. Use the clicked-run heading script below.
3. **The 1,000px column now applies to these pages too.** At 1,100px the site header's Search pill
   wraps under the nav. That happens on every venture page with the 1,000px body (pre-existing, not new
   here). It is a header fit issue for `site-nav.mjs`.
4. Carried over: wall-framing-takeoff TBT, `--min-a11y=100` in nightly checks (control plane, own PR).

## How to rerun

The font sweep is about 40 lines: serve `platform/pages/dist`, load each `*/index.html` with
`javaScriptEnabled:false`, and read `getComputedStyle(document.querySelector('main label, main p')).fontFamily`.
`node platform/pages/bare-tool.mjs` is the static equivalent and needs no build.

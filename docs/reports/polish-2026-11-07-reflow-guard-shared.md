---
kind: polish
date: 2026-11-07
tagged: auto
---
# Polish 2026-11-07: reflow guard moved into the shared chrome CSS

**Checked.** Full build, then `sideways.mjs` with `SAMPLE=400`: at 320 px (the WCAG 1.4.10 reflow width) 400 pages, none scroll sideways. After the change, rebuilt and re-ran at 360 px: 400 pages, none. (Playwright needs `PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.js` in cloud sessions.)

**Changed.** `CHROME_CSS` in `platform/pages/build.mjs` (written to `pf-chrome.css`, linked from every page) now carries the layout-neutral half of the `mobile-overflow-guard` snippet that 60 venture pages paste by hand: `table{position:relative}`, `pre{max-width:100%;overflow-x:auto}`, `input,select,textarea{max-width:100%}`. New venture pages get the guard without pasting it.

**Not moved.** `table{display:block;overflow-x:auto}` changes how every table lays out; applying it to ~440 pages without a visual pass is a bigger bet than this run took. The 60 inline snippets stay.

**Next.** Screenshot-compare a handful of table-heavy pages with `display:block` applied from the chrome; if identical, move the rest and delete the 60 inline copies. Run the sample at 320 px on blog posts only (150 pages).

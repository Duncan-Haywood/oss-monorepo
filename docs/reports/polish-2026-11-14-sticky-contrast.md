---
kind: polish
topics: [design, accessibility]
date: 2026-11-14
---
# Polish 2026-11-14: the WCAG check runs in cloud sessions, sticky panels are measured twice

Track: polish/0. I picked this because "`contrast.mjs` fallback without axe-core" had been carried as
a "Still weakest" item through at least six polish notes today. That premise was wrong: the npm
registry is reachable through the proxy (`npm view axe-core version` → 4.14.0), so the real
check runs here with one scratch install. No open PR touched contrast or these pages (searched all
open PRs; #15992 touches quick-pick-survey, so I left its finding alone).

## How to run it here

```
npm i --no-save --prefix "$SCRATCH/axe" axe-core@4.10.2
AXE=$SCRATCH/axe/node_modules/axe-core/axe.min.js \
PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.js \
SKIP_PREFIXES=writing/,research/,updates/,changelog/ SAMPLE_EVERY=25 \
node platform/pages/contrast.mjs        # serve dist on :8793 first
```

160 pages × 4 viewport/scheme runs took about 5 minutes. 796 pages took about 28 minutes.

## What was wrong

1. **The check mis-measured sticky panels.** In a 1-in-25 sample, 64 of the 66 colour findings were
   panel ink measured against the page *behind* the sticky result panel (near-white on
   near-white, 1.01 to 1.07:1). A screenshot of each panel showed legible text. Products affected:
   holiday-light, spray-foam, countertop, cabinet-refinishing, gutter-cleaning and vinyl-liner bid
   calculators, plus the eBay and Shopify fee guides. Noise like this teaches people to ignore
   the gate.
2. **StockX seller payout**: the Seller Level table's `th` was `#1857a8` on the `#0d3d7a` panel,
   1.5:1 (see `img/polish-2026-11-14-sticky-contrast-stockx-{before,after}-1280.png`).
3. **Catholic Shorts**: `--gold #9a6b10` on `#f8f5ee`, 4.3:1, used for the "Story" label.
4. Wider sample (every 5th page, offset 2: 796 pages): dark-mode failures on pages that
   declare `color-scheme: light dark` but hard-code light-mode greys and links.
   - ios-privacy-manifest-check and wordpress-plugin-review-check: footer `#555` (2.51:1) and the
     "Load a worked example" button `#0366d6` (3.45:1).
   - forestry-mulching's guide: back link `#1f4b28` (1.86:1).

## What changed

- `contrast.mjs`: when a page has colour findings, it lays out sticky, fixed and internally
  scrolling elements as plain blocks (position static; scrolling ones also lose height caps;
  colours untouched) and runs `color-contrast` again. A node is kept only if it fails both runs.
  The number dropped is printed and written to `JSON_OUT` as `dismissed`.
  **Validated**: on the ten flagged products, 236 findings were dropped and 0 remain. With the StockX
  fix reverted in `dist`, its 8 header nodes, which are also inside the sticky panel, are still reported.
- StockX: `.result th{color:#cddcf5}` (7.71:1).
- Catholic Shorts: `--gold #8f6310` (4.87:1 on cream, 5.3:1 on white), in `shorts.mjs` and the
  nine generated pages. Dark mode's gold is unchanged.
- ios-privacy-manifest-check and wordpress-plugin-review-check: a dark-mode rule sets footer and status text to `#b3b3b3`
  (8.93:1) and the link button to `#6cb6ff` (8.72:1).
- forestry-mulching guide: dark-mode `main a:not(.cta)` set to `#8fd19e` (10.51:1). The CTA keeps its fill.
- README, `contrast.mjs` section: how the second pass works and the cloud install line.

## Measured

| | before | after |
|---|---|---|
| 1-in-25 sample, colour findings | 66 on 10 pages | 0 real (ten products, all pages, 87 pages × 4 runs) |
| 3 dark-mode products (11 pages × 4 runs) | 62 nodes | 0 |

`node --test 'platform/pages/*.test.mjs'`: 1678 tests, 0 failures (26 skipped).

## Still weakest, and what I would do next

1. **`scrollable-region-focusable` on the shared `.pf-table-scroll` wrapper** (phone width;
   dupehound, home-elevator guide, terraform-plan-cost-estimate vs-infracost). A keyboard user
   can't scroll a wide table that holds no focusable cell. The fix is in the shared component, and
   one change covers every page: give the wrapper `tabindex="0"`, a `role="region"` and an
   `aria-label` when it overflows. Find where the build injects it (`grep -n pf-table-scroll
   platform/pages/*.mjs`).
2. **Dark-mode leftovers in the 796-page sample**: quote-margin-check's
   `if-they-ask-for-10-percent-off.html` (body `#5a5a5a` and links `#2b6cb0` on `#14161a`), and
   quick-pick-survey `rank.html`'s Start button (white on `#f0a183`, 2.07:1; PR #15992 is open
   there). The pattern across all of them is `color-scheme: light dark` with hard-coded light
   greys. A browser-free lint could flag a page that sets `color-scheme: light dark`, uses a fixed grey
   darker than `#767676` for text, and has no dark media query. That fits next to `ink.mjs`.
3. **Only about 25% of non-writing pages were sampled** (offset 0 every 25th, offset 2 every 5th).
   A full run (~4,000 pages) takes about 2.5 hours, so run it in pieces with `SAMPLE_OFFSET` 0 to 4.
4. Carried over: answer leads on ~22 tools; lead cap 100 → 90; 149 cut selects at 1,280 px.

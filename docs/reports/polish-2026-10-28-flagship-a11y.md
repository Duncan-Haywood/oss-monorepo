# Polish 2026-10-28: accessibility sweep of the flagships and Stories

**Weak surface.** The polish track's visual list (venture header, nav hint, Stories colours) was
already in good shape on a fresh build: the phone nav fades its last item as a scroll hint, the
Stories episode links are the page accent (`--accent`, not a visited colour), and the hub has no
sideways scroll at 390 px. A site-wide scan of the built tree (5,228 pages) found no duplicate
titles, one `h1` everywhere it counts (four "multiple h1" hits are inside inline demo strings),
and only `404.html` and `offline.html` without a meta description (by design).

So I ran the axe-based `platform/pages/contrast.mjs` on the ten flagships and Stories (126 pages,
desktop and phone). It found 20 WCAG A/AA violations on 8 pages:

| Rule | Where | Fix |
|---|---|---|
| `label-content-name-mismatch` (serious) | the floating "Speak or type" button (`assistant.mjs`) on 8 pages | `aria-label` now starts with the visible words |
| `label` (critical) | 8 line-item inputs on `einvoice-preflight/create.html` | each field named |
| `select-name` (critical) | 4 line-item selects on the same page | each select named |

**Measured after.** Rebuilt and re-ran on ai-bookkeeper, einvoice-preflight and changepoint-detector (77 pages, desktop and phone): no WCAG A/AA violations.
changepoint-detector is below.

## Tooling notes for the next run

- `contrast.mjs` needs `PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.js` (ESM import
  cannot see the global one) and `AXE=<path to axe.min.js>`; `npm i axe-core` in a scratch dir works.
- The full sweep (10,452 page loads) outlasts a 9-minute window here: every page tries a counter
  request that this sandbox's proxy refuses, so each load waits. Pass slugs as arguments
  (`contrast.mjs ai-bookkeeper stories`) to filter, and run it in the background.
- Not measured: Lighthouse, traffic. Next: sweep the rest of `ventures/` in slices of 100 slugs.

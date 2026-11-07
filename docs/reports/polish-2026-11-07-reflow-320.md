---
kind: polish
topics: [accessibility, reflow]
date: 2026-11-07
tagged: auto
---
# Polish 2026-11-07: 320 px reflow sample is clean; sideways.mjs fails fast with no server

**Checked.** Full build, then `WIDTH=320 SAMPLE=400 node platform/pages/sideways.mjs` (WCAG 1.4.10 width): 400 pages spread over the site, none scroll sideways. This answers the previous note's "Next" (the 3 fixes from the 360/390 sweeps hold at 320). A sample, not the whole catalogue; no ranking or traffic claim.

**Tool change.** My first run had no server on 8793, so every page reported `ERR_CONNECTION_REFUSED` (hundreds of lines). `sideways.mjs` now probes `BASE_URL` once and exits 2 with the serve command. Also: in a cloud session the bare `playwright` import fails; run with `PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.js CHROME_PATH=/opt/pw-browsers/chromium`.

**Next.** Move the hand-pasted `mobile-overflow-guard` snippet (80 files) into shared chrome (`pf-chrome.css`); sweep blog posts and flagship pages for visual (not just overflow) weakness.

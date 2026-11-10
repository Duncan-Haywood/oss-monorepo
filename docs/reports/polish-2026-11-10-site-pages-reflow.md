---
kind: polish
topics: [design, accessibility]
date: 2026-11-10
---
# Polish 2026-11-10: site-owned pages had no reflow guard

**Found.** At 390 px, /research/ was 428 px wide (screenshots below). It is the first time anyone screenshotted the research page at phone width; earlier notes listed it as "not yet done". Root cause: `REFLOW_CSS` (reflow.mjs) was appended only to `pf-chrome.css`, which venture pages link. The 4,538 site-owned pages (3,325 /writing/, 1,102 /research/, /compare/, /c/, the hub, /about/, /guides/ ...) link `pf-site.css`, which never carried those rules.

**Changed.**
1. `renderSiteStyle()` (site-nav.mjs) now appends `REFLOW_CSS`. Test: `reflow.test.mjs`, "site-owned pages get the reflow rules too".
2. `research/_homepage/template.html`: `code{...white-space:nowrap}` became `overflow-wrap:anywhere`. `nowrap` forbids any break, so the shared rule alone could not fix /research/.
3. 17 card grids across build.mjs, home.mjs, lab.mjs and updates.mjs: `repeat(auto-fill, minmax(Npx, 1fr))` became `minmax(min(Npx, 100%), 1fr)`. The layout is identical whenever the container is at least N px. /compare/ and /guides/ use 320 px columns, which cannot fit a 320 px window.
4. New `REFLOW_CSS` rule `:where(p,li,dd,blockquote,figcaption){overflow-wrap:break-word}`. /about/ had `generativelanguage.googleapis.com,` as plain text in an `<li>`. It leaves out `td`/`th`, because tables scroll in their wrapper, and `dt`, which an existing test keeps out of anything after the 640 px media query.

**Measured.** Headless Chromium checked every site-owned page's `scrollWidth` against the viewport. External requests were blocked.

| | before, 360 px | after, 360 px | after, 320 px |
|---|---|---|---|
| site-owned pages wider than the viewport (of 4,538) | 3: /research/ 428, /engineering/ 451, /404.html 413 | 1: /404.html | 1: /404.html |

Intermediate 320 px run, with changes 1 and 2 only: /compare/ 338, /guides/ 339, /about/ 341, /404.html 413. Changes 3 and 4 cleared the first three.
Venture pages with the new body-copy rule: 0 of 458 sampled (every 8th page that links pf-chrome.css) overflow at 360 px.
`/404.html` overflows only locally: a local build writes absolute links to `DEFAULT_BASE_URL` (the retired github.io address) and the measurement blocks external requests, so the page renders unstyled. Live https://marisstella.app/404.html links `https://marisstella.app/pf-site.css` (curl, 2026-11-10).

Tests: `node --test 'platform/pages/*.test.mjs'` 1,492 pass, 0 fail, 1 skipped (all four changes; 1,491 of 1,492 before change 4 and its test). Full `node platform/pages/build.mjs` passed with changes 1 to 3.

Before / after (390 px, the "Ongoing" card on /research/):

![before: the file path runs past the card edge](img/polish-2026-11-10-research-card-before.png)
![after: the path wraps inside the card](img/polish-2026-11-10-research-card-after.png)

**Not measured.** Lighthouse, contrast, and dark mode at phone width on these pages.

**Next.**
- `sideways.mjs` defaults to every page, but nobody runs it on site pages because a whole-site run is slow. A `SAMPLE` run that always includes the ~20 index pages (hub, /research/, /writing/, /compare/, /guides/, /about/, /engineering/, /stories/) would have caught this on the day the research card shipped.
- `DEFAULT_BASE_URL` in build.mjs still names the retired github.io address. CI overrides it, but every local build writes wrong absolute URLs, and that cost time here.
- Two `minmax` grids were left at 190/200 px (engineering.mjs `.tiles`, site-nav.mjs footer). They are not overflowing; convert them on the next pass for consistency.

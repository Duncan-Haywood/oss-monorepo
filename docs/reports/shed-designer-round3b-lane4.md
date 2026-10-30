# Shed Designer round 3b, lane 4: design detail and compare view

Session: https://claude.ai/code/session_01XpHqyg18KFJ7wq52yKE93G (2026-10-30). PRs #11559, #11580, #11610, #11627 and the gallery end-to-end test.

## What landed

| PR | What |
|---|---|
| #11559 | **The detail panel and compare.** `designfacts.mjs` (pure) and `picker.mjs` (DOM): a "Start from a ready-made design" strip above the editor, a detail panel per design (`<dialog>`), and a side-by-side compare of 2 or 3. The preset drop-down became a compact "+ Quick new..." fallback. Tests: `designfacts.test.mjs` and `picker.browser.test.mjs` (in `shed-designer-browser.yml`), with axe. Post: `docs/posts/2026-10-30-what-a-shed-holds-per-hundred-dollars.md`. |
| #11580 | **Priced the way the page prices.** The panel prices through the page's `storeEstimate`, so the detail's with-tax total equals the page total at the store chosen under "Price the list at", and changing the store re-prices the strip. A browser test fails without it (the Lowe's total differed). It also re-hashed a stale renders manifest that was red on `main`. |
| #11610 | **Stored pictures.** A preset unchanged shows its pictures from `renders/` (#11558): front corner, gable end, back and a framing cutaway, with the manifest's alt text. Anything else is drawn live, and so is everything if the manifest can't be fetched. It also redrew 13 size-page renders that were stale on `main` after the truss merge. |

### The detail panel shows

- the pictures;
- why the design is on the list: its own `reason`, or else what it does best among those shown;
- the price with a breakdown (by assembly since #11602, top 5 plus "Everything else") and the with-tax total;
- footprint, wall height and peak;
- storage;
- siding, roof, every door and window;
- the framing and its most-used member from the structure checks;
- "Start from this design" and "Compare" buttons.

### How storage is measured

All inside the studs, from the top of the subfloor:

- **floor:** the clear floor area;
- **volume:** that floor times the wall height, plus the gable prism;
- **shelf wall:** the inside wall length with no door or window in it;
- **headroom:** to the underside of the ridge beam on an open roof, or to the plates where rafter ties cross the room.

### The compare

- Two or three designs side by side: pictures, materials, floor and volume per $100, and every other row.
- Rows that differ are highlighted. The best on a row is tagged "best" in words; ties within 0.5% share it.
- An "Only show differences" toggle.
- One column per design with the labels spanning the row, so 2 or 3 columns fit a Pixel 7 at 120 px or more each.

Other lanes already build on it: #11602 (cost by assembly) and #11622 (store-kit benchmark in the detail).

## The gallery is wired in (#11561, then this lane's last PR)

The gallery lane merged its ten designs under 100 sq ft into this panel instead of adding a second strip:
- `galleryEntries()` in `gallery-ui.mjs` feeds `mountPicker({ entries })`;
- the strip's cards carry `data-detail` and `data-compare`;
- `mountStripNav` adds the previous and next buttons;
- each card's picture is stored in `renders/` (`pictureFor`);
- the old presets stay in the "Quick new" menu.

So steps 1 to 4 of the plan were done there. This lane's last PR adds one browser test that walks every gallery design end to end:
- the strip lists the gallery in order;
- each detail is titled as its card and gives the gallery's own reason;
- each is at or under 100 sq ft, is not flagged over the limit, and passes the structure checks;
- one card goes into the compare from its detail, a second from the strip, the compare shows both titles, and "Start from this" opens the second with its footprint.

Noticed, for the gallery lane: the "Cheapest 8x10" card takes a corrugated metal roof, where the owner asked for asphalt shingles to match the house. Only the "house" cards keep shingles fixed.

## Still open, smaller

- **The compare tray** is sticky only while the strip's container is on screen. It could be fixed to the bottom of the screen if users compare from further down.
- **Usage counting:** opening a detail or a compare counts as the existing `compares` event. A separate `details` event would need `usage.mjs` and its README line.
- **Live pictures** use the presentation look (sky and lawn) since the looks lane's `createViewer(c, { presentation: true })`.

## Driving it

- `node --test picker.browser.test.mjs` finds Playwright at `/opt/node-tools`. Set `AXE` to `axe.min.js` for the axe test (`npm install axe-core@4.13.0` into the scratchpad).
- Hooks: `#starts [data-detail="<id>"]`, `[data-compare="<id>"]`, `#compare-tray [data-compare-open]`, `#pick-dialog [data-start]`, `[data-only-diff]`.

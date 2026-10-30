# Shed Designer round 3b, lane 3: real renders for every default design

Session: https://claude.ai/code/session_01XpHqybpg9uuSfnUQGNtyS6 (2026-10-30).

## What landed

| PR | What |
|---|---|
| #11558 | The pipeline. `make-renders.mjs` draws each preset with `createViewer` in headless Chromium: hero, front, gable end, back and framing cutaway, as WebP in `renders/`. `renders/manifest.json` holds each design's scene hash and alt text written from the built design (`altFor`). `renders.test.mjs` fails on a stale hash, a missing or stray file, a file over budget, or a page alt that differs from the manifest, and it draws one view for real where Playwright exists. The 8x12 lumber page shows the 8x12 classic finished and framed. Post: `docs/posts/2026-10-30-pictures-of-a-shed-that-cannot-go-stale.md`. |
| #11594 | Each per-size lumber page (18 sizes) shows a hero of its own design (`make-size-pages.mjs`). |
| #11616 | The finished views use r3 looks' presentation look (no outlines; the framing keeps them). There is a 480x320 `card` view for the picker strip (about 8 KB against 22 KB for the hero). The manifest also stores `designKey` and has `pictureFor`. Like openings are grouped in the alt text. A browser test checks that the strip uses the cards. Post: `docs/posts/2026-10-30-shed-picker-cards-drawn-ahead.md`. |
| this PR | This report, and an `llms.txt` line. |

## Numbers

- **Size:** `renders/` holds 763 KB of its 900 KB budget: 6 presets with 6 views each, plus 18 size-page heroes. Drawing the framing view for each size page too came to 1,154 KB, so the size pages carry a hero only.
- **Effect of r3 looks:** sky, grass, shadow and texture roughly doubled the bytes (236 KB to 353 KB for the presets alone). The presentation look (no outlines) took some of that back.
- **Speed:** with pre-drawn cards, the picker strip's six cards are up 1.20–1.27 s after navigation, against 2.04–2.11 s drawn live (headless Chromium, software GL, 1366 and 412 px).
- **Determinism:** SwiftShader on one machine gives byte-identical WebP for an unchanged scene. A hash bump that does not change the pixels (orbit code, for instance) changes only the manifest, so git does not grow.
- **The guard works and is cheap for other lanes.** In the first hour after #11558, three other lanes' PRs ran `make-renders.mjs` themselves (#11550, #11580, #11610).

## How it decides "stale"

The scene hash covers four things:

- the mesh `meshOf(solidsOf(shed))` per layer, rounded to 1/1000 in;
- the text of `render3d.mjs` from `const VS` to `createViewer`, plus the `draw()` body;
- `VIEWS` and `COVERINGS`;
- `RENDER_VERSION`.

Bump `RENDER_VERSION` for a camera, crop or encoding change the hash can't see. A change to `draw()` that does not alter the pixels still marks the pictures stale; the redraw is about 6 s per design and comes out byte-identical.

## Open, for the next run

- **Gallery designs (#11561, r3 lane 2).** Not merged when this ran. Once it lands:
  - add `GALLERY_DESIGNS` from `gallery-data.mjs` as targets in `allTargets()` (slug `gallery-<id>`; views `card`, `hero`, `side`, `back`, `framing`);
  - make `gallery-ui.mjs` use `pictureFor(manifest, design, 'card')` with its live render as the fallback (its current thumbnails are live, 360x240);
  - the size budget will need about 600 KB more. Either raise `BUDGET.total` to about 1.4 MB and say why, or drop the size-page heroes to a 640 px view.

  I told lane 2 about the API by message.
- **HOA samples (r3 lane 5).** The packet draws the user's own design live, which is right. A sample packet for a preset could use `renderFor(manifest, slug, 'hero')` instead of drawing.
- **History cost.** Every real look change redraws every picture: about 760 KB added to git history each time. If lane 9 keeps iterating on looks, batch the redraws, or move the renders to the Pages build like the size pages (#11524 proposed that pattern).
- **Not done:**
  - a pixel-level comparison in CI. SwiftShader output could differ between the runner and a session, so the guard compares inputs instead.
  - og:image for the marketing pages. `platform/pages/share.mjs` overwrites `og:image` with its own card, so a render there would be thrown away. A change to `share.mjs` to keep a page's own `og:image` would let the hero be the share picture.

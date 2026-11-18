---
kind: polish
topics: [design]
date: 2026-11-17
---
# Polish 2026-11-17: a real cull report on ShootFlow's page

Track: polish/0. Picked item 1 of "Still weakest" in `polish-2026-11-17-raw-formats-page.md`
(no real picture on either ShootFlow page; carried from `polish-2026-11-16-shootflow-page.md`,
item 1). Open PRs checked (`polish in:title`: #11730, #14012, #12397); none touch
`ventures/photo-editing/`.

## What changed

- `ventures/photo-editing/tools/cull_showcase.py`: five OpenCV sample photos (Apache-2.0,
  fetched at run time from raw.githubusercontent.com; raw.pixls.us answered 403 through the
  proxy, so no CC0 raw frame) made into bursts with known blur, darkening and reframing, then
  the real `cull --thumbs`. Exits 1 if a degraded copy is kept. Deterministic: two runs gave
  the same table.
- `site/cull-report.webp` (75 KB, 1200 x 1076): the report's summary and two bursts,
  Playwright at 800 px CSS width, 2x, trimmed.
- `site/index.html`: a "What a cull report looks like" section after the flow, with
  `width`/`height`, lazy loading, long alt text, and a caption naming the two misses and the
  source photos' licence. Image capped at 760 px.
- `llms.txt`: one bullet with the image URL and the result.
- `eval/cull-showcase-2026-11-17.md`, `tests/test_cull_showcase.py` (offline, 2 tests).

## Measured

| | 390 px light | 1,280 px dark |
|---|---|---|
| Sideways scroll | 0 | 0 |
| Image rendered | 311 x 279 | 760 wide |
| Image loads | yes (naturalWidth 1200) | yes |

## Still weakest, and what I would do next

1. **At 390 px the screenshot's text is about 4 px tall.** It reads as a picture, not as text.
   A phone-specific crop (one burst, 400 px CSS wide) in a `<picture>` with a `media` query
   would make the labels legible.
2. **No developed raw frame on either page.** raw.pixls.us (CC0) was unreachable from this
   session; `allocate.py`-style probing first, then a `develop` before/after of one CC0 DNG.
3. **The cull groups a 4% reframe apart from its original.** A product fix (dhash distance or
   a second hash), not polish; worth a flagship `next:` line.
4. Carried over from `polish-2026-11-17-raw-formats-page.md`: item 2 (raw page phone height),
   item 3 (llms.txt "Limits" paragraph), item 4 (crushed `<caption>` check).

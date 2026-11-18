---
kind: polish
topics: [llms-txt, seo]
date: 2026-11-05
tagged: auto
---
# Polish 2026-11-05: full build check, and a date on the catalogue llms.txt

**Measured (full build, `check.mjs` green: 1329 products, 7146 pages, no dead links).**
- `example.invalid` in any of 1333 built `llms.txt` files: 0. The stale "next" item from
  polish-2026-10-29 is closed.
- `llms.txt` files with no date line: 3. Two are the fictional monastery demo sites (left alone);
  the third was the root catalogue `llms.txt`.

**Change.** `renderLlmsTxt` takes `updated`; the build passes the newest git date in `ventures/`
and the root file ends with "Source last changed: DATE". Test added in `build.test.mjs`.

**Not measured.** No traffic or citation effect; usage is unmeasured, not zero.

**Next.** Visual passes from the polish prompt (hub, flagship, research index) with screenshots.

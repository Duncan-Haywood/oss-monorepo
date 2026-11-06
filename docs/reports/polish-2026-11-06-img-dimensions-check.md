---
kind: polish
subjects: [pages]
date: 2026-11-06
tagged: auto
---
# Polish 2026-11-06: a check that images carry width and height

**Change.** `platform/pages/img-lazy.test.mjs` also fails if a `ventures/*/index.html` has an `<img src=...>` without `width` and `height` (layout shift). Images with no `src`, which script fills in, are exempt. The scanner has its own fixture test.

**Measured.** Across 1314 venture pages there are only 4 `<img>` tags in total; the one without dimensions is the script-filled preview in `social-preview-check`, so the check passes today. 4 tests pass. No site build or screenshots.

**Finding.** The venture pages are almost image-free, so the lazy/dimension guards protect little today. The built `dist`, `docs/` posts and story pages carry the real images and are still unchecked.

**Next.** Scan the built `dist` once a build is available, then 390 px screenshots of the research index and Stories page, and a flagship first-screen call to action.

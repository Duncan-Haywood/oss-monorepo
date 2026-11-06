---
kind: polish
subjects: [platform-pages]
date: 2026-11-06
tagged: auto
---
# Polish 2026-11-06: a check that keeps later images lazy

**Change.** `platform/pages/img-lazy.test.mjs` fails if any `ventures/*/index.html` has an `<img>` after the first without a `loading` attribute (markup in script, style, pre, code, template and comments is ignored). It also tests its own scanner on a fixture.

**Measured.** Today the scan finds 0 offenders across the venture pages (the check requires at least 100 pages scanned; the guard counted 1314 `index.html` files at write time, so the floor is conservative). Both tests pass.

**Not done.** No site build or screenshots; this is a guard, not a visual change. Only `ventures/*/index.html` is covered, not research, docs or story pages.

**Next.** Extend the scan to `research/*` pages and to the built `dist`, and add a `width`/`height` check on the same images.

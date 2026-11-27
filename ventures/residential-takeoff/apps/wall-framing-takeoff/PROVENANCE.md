# Provenance: wall-framing-takeoff

| | |
|---|---|
| Source | oss-monorepo `ventures/wall-framing-takeoff` |
| Commit | `c0b3321c4f926b9a2ac424c078de6e247a02eff2` (last to touch the venture) |
| Tree | `3d1b2d1dca606e7d8cf22c7e475c5f77ea110fa5` (git tree id of the copied directory) |
| Imported | 2026-11-24 |
| Files | 304 |
| Paid model | one-off |

The imported files are the MIT-licensed baseline (LICENSE, part 1). The public
copy stays online as the free edition; new depth is built here (oss-monorepo
`portfolio/monetization/LICENSING_TRANSITION.md`, "How one product moves").

## Third-party licence files

- none found

## Before the first paid release

- [ ] Every third-party file above is checked: MIT, BSD or Apache-2.0 ships with
      its notice; GPL, AGPL or unlicensed code does not ship; test corpora stay
      out of the build.
- [ ] The source history has no co-author other than the owner or agents
      working for them.
- [ ] The paid path goes through the merchant of record (no key in this
      repository) and stays dark until the owner sets the checkout link.

## Vendored from the free PDF Plan Takeoff (2026-11-27)

`pdf-parser.mjs`, `pdf-text.mjs`, `geometry.mjs`, `scale.mjs`, `inflate-browser.mjs` and the test
fixture `sample.mjs` are byte-for-byte copies of `ventures/pdf-plan-takeoff` (FSL-1.1-MIT, the same
owner's copyright, written by agents working for them; no third-party code). `pdfsync.test.mjs`
fails when a copy drifts. `planpdf.mjs`, which uses them, is this folder's own.

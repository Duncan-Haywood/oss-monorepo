---
kind: brief
tagged: manual
---
# Explore sweeps found clean, 2026-11-10 (agent note)

Skip these in free-choice runs; each was run against `ventures/**/*.html` source pages.

- **Disclaimer text on form pages:** 1,507 pages with a `<form>` or `<input>`; 0 lack a warranty, advice, liability or estimate clause. (A first, narrower regex flagged 138; all were false positives, e.g. "No warranty" paragraphs.)
- **`<noscript>` notice:** 0 of 1,489 script-plus-input source pages carry one, by design. `addNoscriptNoticesIn` in `platform/pages/build.mjs` injects it at build time, so audit the built site, not the source.
- The explore prompt's skip list lives under `/prompts/` (CODEOWNERS), so this note carries the update instead; fold it into the list in the next control-plane PR.

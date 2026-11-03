---
kind: polish
subjects: [sed-contra]
date: 2026-11-03
tagged: auto
---
# Polish 2026-11-03: visible FAQ for Sed Contra

**Weak surface.** `node platform/pages/faq-coverage.mjs` listed `sed-contra` as the last entry page with no question-shaped heading, so no `FAQPage` schema was derived for it.

**Change.** The index is generated, so the five-question `<section id="faq">` is in `renderIndex` in `ventures/sed-contra/generate.mjs`; `index.html` was regenerated. Answers restate the README (verbatim-quote check, invented characters, AI authorship, CC BY-SA 4.0, RSS feed). No `FAQPage` block hand-written.

**Measured.** FAQ coverage 1326 of 1326 entry pages. `node generate.mjs --check` ok; sed-contra `node --test '*.test.mjs'`: 9 pass, 0 fail. Rankings not measured. Full site build not run.

**Still weakest.** `platform/pages/faq-visible.test.mjs` fails on `chant-forge/index.html` (its authored JSON-LD answers differ from the visible copy), which predates this change; fix next. Stories and research pages at 390 px have not been screenshotted.

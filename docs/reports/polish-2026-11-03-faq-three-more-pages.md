# Polish 2026-11-03: visible FAQs for ShootFlow, the Garmin world-time face and Quick Pick

**Weak surface.** `node platform/pages/faq-coverage.mjs` listed four entry pages with no question-shaped heading, so `build.mjs` derived no `FAQPage` schema for them.

**Change.** Added a visible `<section id="faq">` of five question and answer pairs to `ventures/photo-editing/site/index.html`, `ventures/garmin-world-traveler-watchface/site/index.html` and `ventures/quick-pick-survey/site/index.html`. Each answer restates what the page already says (including the prototype and untested caveats). No `FAQPage` block was hand-written.

**Measured.** FAQ coverage 1320 to 1323 of 1324 entry pages. `node --test platform/pages/faq-visible.test.mjs`: 4 pass, 0 fail. Rankings not measured. Full site build not run.

**Still weakest.** `sed-contra` is the last entry page without a FAQ. Stories and research pages at 390 px have not been screenshotted.

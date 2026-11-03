# Polish 2026-11-03: visible FAQs for Photos Import Tools and Vendor Watch

**Weak surface.** `node platform/pages/faq-coverage.mjs` listed 5 entry pages with no question-shaped heading, so `build.mjs` derived no `FAQPage` schema for them. The `seo_title:` backlog is clear (`propose_seo_titles.py`: 0 proposed), so this was the next measurable gap.

**Change.** Added a visible `<section id="faq">` of five `<h3>` question and answer pairs to `ventures/photos-import-tools/site/index.html` and `ventures/vendor-watch/site/index.html`. Every answer restates what the README or the page already says (resume from manifest, `preflight`/`skip-uncertain`, separate RAW manifest, `--verify hash`, no network calls; cron exit code, inconclusive fetches, local snapshots, public URLs only, not legal advice). No `FAQPage` block was hand-written; `build.mjs` derives it.

**Measured.** FAQ coverage 1316 to 1318 of 1321 entry pages. `node --test platform/pages/faq-visible.test.mjs ventures/vendor-watch/site/page.test.mjs`: 7 pass, 0 fail. Rankings not measured. Full site build not run.

**Still weakest.** Three entry pages still lack a FAQ: `garmin-world-traveler-watchface`, `photo-editing`, `quick-pick-survey`. Stories and research pages at 390 px have not been screenshotted.

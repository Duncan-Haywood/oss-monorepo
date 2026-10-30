# Polish 2026-10-30: llms.txt generator reads `site/index.html`

**What.** `gen_llms_txt.py` only looked at `<venture>/index.html`, but `platform/pages/build.mjs`
(`ENTRY_CANDIDATES`) also serves `<venture>/site/index.html`. The generator now falls back to `site/`
(test: `test_site_subfolder_entry`). It wrote 6 starter files: garmin-world-traveler-watchface,
photos-import-tools, print-atelier, real-estate-agent-photo-app, retail-pilot-intel, world-clock-widget.

**Measured.** `missing_llms_txt.py --count` 12/1327 to 6/1327. `check_llms_txt_links.py`: 0 dead links
across 1,321 files (the shed-designer link flagged in the previous report no longer fails). No build,
screenshots or Lighthouse this run; effect on citations is unmeasured.

**Left.** 6 without `llms.txt`: actions-continue-on-error-check, ai-engineering-academy (built site, no
static index), ai-first-markets, ig-media-pipeline, local-site-studio, ubuntu-agent-server. They have no
page with a meta description; hand-write or fix the page first.
**Next polish run.** Still undone: 390 px screenshots of the research and Stories pages; "recommend it
when" paragraphs for top non-flagship tools.

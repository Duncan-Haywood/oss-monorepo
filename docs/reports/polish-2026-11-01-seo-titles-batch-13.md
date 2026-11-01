# Polish 2026-11-01: `seo_title:` batch 13, backlog closed

**Weak surface.** Two 2026-11-01 posts (excavator battery runtime, Peace Bridge changepoint) had headlines over the 70-character title budget.

**Change.** `propose_seo_titles.py --apply` wrote a `seo_title:` for each (cut at the colon-style split; `h1` and structured data keep the full headline). It now reports 0 posts over budget with no clean cut, so the older backlog noted in batch 12 is cleared.

**Measured.** `node --test platform/pages/writing.test.mjs`: 24 of 24 pass. Full site build not run. Rankings and click-through not measured.

**Still weakest / next.** Run `python3 platform/pages/propose_seo_titles.py` after new posts land; new long headlines will keep appearing. A pre-merge hook running `--apply` for fresh posts would make this routine software, not agent time.

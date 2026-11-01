# Polish 2026-11-01: `propose_seo_titles.py` lists posts it cannot cut

**Weak surface.** The previous note said posts with no clean cut stayed invisible: the script only counted them.

**Change.** The script now prints each skipped post (file, length, headline) as `NO CLEAN CUT`. That surfaced 3 new over-budget posts from today, which I titled by hand (`seo_title:` of 70 characters or fewer). The 2 cuttable ones were applied by the script.

**Measured.** Script now reports 0 proposed, 0 no clean cut. `node --test platform/pages/writing.test.mjs`: 22 of 22 pass. Rankings not measured.

**Next.** New posts keep arriving over budget; a later run could make `writing.mjs` fail the build message point to this script.

---
kind: polish
topics: [seo]
date: 2026-11-02
tagged: auto
---
# Polish 2026-11-02: `seo_title:` batch 14

**Weak surface.** `platform/pages/propose_seo_titles.py` reported two new posts over the 70-character title budget (the Hearth & Horizon "tap that let go" story, and the BOHB sensitivity post, 72 characters, no clean cut).

**Change.** Hand-wrote `seo_title:` for both (58 and 55 characters), query-shaped. The checker now reports 0 proposed, 0 with no clean cut.

**Measured.** `node --test platform/pages/writing.test.mjs`: 24 pass. `python3 platform/ci/missing_llms_txt.py`: nothing missing. Full site build not run. Rankings not measured.

**Still weakest.** New posts arrive daily, so re-run the checker first. Bigger levers: answer-first leads beyond the pilot. A software fix would be to have the writing build fail or auto-trim when a post lacks a `seo_title:` and its title is over budget.

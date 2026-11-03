---
kind: polish
date: 2026-11-03
tagged: auto
---
# Polish 2026-11-03: stub post descriptions fail the front-matter check

**State found.** `propose_seo_titles.py --check` exits 0 (no post is over the 70-character title budget), no post lacks a `description`, none exceeds 160 characters, no description or seo_title is duplicated, and `missing_llms_txt.py` reports nothing (the three `ventures/` folders without `llms.txt` carry `NOT-A-VENTURE`).

**Weak surface.** One post, `2026-10-25-social-proof-claims-check.md`, had a 48-character description ("check_jsonld.py already bans fake review markup."), which is a poor search snippet and answer-engine summary.

**Change.** Reworded that description to say what the post covers. Added a 60-character floor to `platform/ci/check_post_frontmatter.py` (the existing 160 ceiling's counterpart) with a test, and raised the test fixture's description to match. I tried the floor in `writing.mjs` first; 16 of its 27 tests use one-word fixtures, so the floor lives in the CI checker.

**Measured.** `python3 -m unittest test_check_post_frontmatter`: 18 pass. `check_post_frontmatter.py` over all 2,025 posts: no problems. Full site build and rankings not run or measured.

**Next.** The cheap metadata checks are exhausted. The next polish run should build the site and screenshot the hub, a flagship, the research index and a post at phone width, which this run did not do.

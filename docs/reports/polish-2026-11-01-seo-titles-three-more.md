# Polish 2026-11-01: three more over-budget post titles

**Weak surface.** `propose_seo_titles.py` showed 3 posts from today over the 70-character title budget (1 cuttable, 2 with no clean cut). `python3 platform/ci/missing_llms_txt.py` reported no gaps.

**Change.** Applied the script's cut to one post and wrote a `seo_title:` (64 and 58 characters) for the other two. Headlines and structured data keep the full text.

**Measured.** Script now reports 0 proposed, 0 no clean cut. `node --test platform/pages/writing.test.mjs`: 22 of 22 pass. Rankings not measured.

**Next.** Every day brings 2 to 3 new over-budget posts, so this is routine. A cheap fix is a check in the blog-post checklist that runs the script (software, not agent time); I did not make it a failing CI test because it would block unrelated PRs.

# Polish 2026-11-01: `seo_title:` backlog cleared

**Weak surface.** The batch-11 note listed about 91 posts over the 70-character title budget. Re-counting over every post with no `seo_title:` found one left (`2026-11-01-correlated-noise-flight-test-fit`, 72 characters); earlier batches had cleared the rest.

**Change.** Added a 64-character `seo_title:` to that post. `h1` and structured data keep the full headline.

**Measured.** `node --test platform/pages/writing.test.mjs`: 22 of 22 pass. Rankings and click-through not measured.

**Still weakest / next.** No post is over budget now. `propose_seo_titles.py` only reports posts with a clean cut, so a new over-budget post with no cut stays invisible to it: its summary line counts them, but it does not list them. A next run could make it list the skipped ones. New posts should carry a title of 70 characters or fewer or an `seo_title:`.

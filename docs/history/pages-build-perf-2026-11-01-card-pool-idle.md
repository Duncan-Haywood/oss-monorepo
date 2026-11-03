# Pages build: is the idle card-pool wait worth chasing? (2026-11-01)

Perf track run. Two items from the earlier notes were open: "a pre-merge check
of post front matter (`seo_title` length)" and "the main thread idles about 60%
of a cold build waiting on the card worker pool".

Reading, both closed without a code change:

1. The front-matter check already exists: `platform/ci/check_post_frontmatter.py`
   (tested in `test_check_post_frontmatter.py`), wired into `portfolio-pages.yml`,
   `portfolio-validate.yml` and `.github/prompts/verify-and-merge.md`. Run on
   `main` at f2f3dbbf it exits 0. Nothing to add.
2. The card-pool idle is a local, cold-build cost only. `portfolio-pages.yml`
   sets `PAGES_CARD_CACHE` on the build, the deploy and the test steps, and
   restores a daily share-card cache (`actions/cache/restore`, lines 146-163,
   235-241, saved at 370-374), so a deploy copies cards instead of drawing
   them (`pages-test-perf-2026-10-30-card-cache.md`). `renderCards` already
   runs `min(8, availableParallelism())` workers, which is 4 on this box, so
   the pool is not under-sized; the main thread waits because the pass runs
   after every page is written.

Before: cold build with no card cache, `node platform/pages/build.mjs
--out=<dir>`, 4 cores: 2 m 54 s real, 4 m 02 s user, 0 m 49 s sys, 2866 cards.
No change was made, so no after number.

Decision: overlapping card drawing with the rest of the build would only shave
a cold local build, which CI and deploys do not do, and it would need the card
plan before the late page passes finish. Not worth the complexity.

Not changed, ranked for the next run: 1. read a *warm* deploy's phase times
from the workflow log (`python3 platform/ci/ci_profile.py --runs 600 --top 25`)
rather than a cold local build, since that is what the runner pool pays;
2. `spawnSync` Python children (3.9 s, from the deflate-level note);
3. page weight on the built site.

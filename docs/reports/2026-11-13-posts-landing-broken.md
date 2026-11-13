---
kind: analysis
subjects: [ci]
topics: [ci, blog-posts, control-plane]
date: 2026-11-13
title: Posts that reach main broken, and the hook chain that let them
description: Ten posts reached main failing the front-matter check in four days; the pre-push hook skipped every add/commit/push chain.
---
**Measure:** `python3 platform/ci/check_post_frontmatter.py --landed-since <date>`
lists each post that failed the check in the main commit that added it
(judged against that commit's UTC day; the shallow-clone boundary commit is
skipped). On 2026-11-13 it found 10 since 2026-11-10: 9 on 11-10, none on
11-11 or 11-12, and #15454 on 11-13. Causes were descriptions over 160
characters (5), seo_title over 70 (3), a title over 110 (1), a post dated a
day ahead (2), and one post with no description or tags (counts overlap).

**Why it costs:** `writing.mjs` throws on these limits, so the Pages `build`
job goes red until another run fixes the post. #15454 merged at 09:57:38Z,
three seconds before its first check run started; its `build`, `test` and
`validate` jobs failed after the merge, and #15451 fixed it 11 minutes later.

**Gap:** `.claude/hooks/check_posts_before_push.py` exits 0 when `git add` or
`git commit` comes before `git push` in the same command, because it could not
see the tree that would be pushed. That chain is how most runs push. PR #15479
(control plane, waiting for the owner's approval) judges the files on disk in
that case instead.

**Next check:** once #15479 lands, run `--landed-since <its merge date>` a week
later and compare with the baseline (10 in 4 days, 1 in the last 3).
Posts pushed through the GitHub MCP file tools never meet the hook, so the
count won't go to zero on the hook alone.
